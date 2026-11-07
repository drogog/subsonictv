const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

// Generated sine tones. The reference hashes are FFmpeg's interleaved f32le output.
const fixtures = [
  ['mono', '5de0c54ab61bec2d875753613fde816c62f97041bdf8f6a0ea8c30251d0da69f'],
  ['stereo', 'f90740f91777707d2a8863b23673a466c489ab967b6f297b2835f7693bea4fae']
];
const audio = {
  createBuffer(numberOfChannels, length, sampleRate) {
    const channels = Array.from({length:numberOfChannels}, () => new Float32Array(length));
    return {numberOfChannels, length, sampleRate, getChannelData(ch) { return channels[ch]; }};
  }
};
async function verify(name, expected) {
  const file = fs.readFileSync('tests/fixtures/alac-' + name + '.m4a');
  const requests = [];
  let status = 206, aborted = false;
  class RangeRequest {
    open() {}
    setRequestHeader(key, value) {
      assert.equal(key, 'Range');
      const match = /^bytes=(\d+)-(\d+)$/.exec(value);
      this.start = Number(match[1]);
      this.end = Number(match[2]);
    }
    abort() { aborted = true; }
    getResponseHeader() { return 'bytes ' + this.start + '-' + this.end + '/' + file.length; }
    send() {
      requests.push([this.start, this.end]);
      queueMicrotask(() => {
        this.status = status; this.readyState = 2; this.onreadystatechange();
        if (aborted) return;
        this.response = Uint8Array.from(file.subarray(this.start, this.end + 1)).buffer;
        this.readyState = 4; this.onreadystatechange();
      });
    }
  }
  const context = vm.createContext({XMLHttpRequest:RangeRequest});
  for (const script of ['alac-packet','m4a-reader']) {
    vm.runInContext(fs.readFileSync('subsonic-tv/js/' + script + '.js','utf8'),context);
  }
  const reader = context.M4AReader.open('fixture',audio);
  const hash = crypto.createHash('sha256');
  let last = false, chunks = 0;
  while (!last) {
    const result = await new Promise((resolve,reject) => reader.next((err,pcm,eof) => {
      if (err) reject(new Error(err)); else resolve({pcm,eof});
    }));
    const {pcm,eof} = result;
    const bytes = Buffer.alloc(4 * pcm.length * pcm.numberOfChannels);
    let offset = 0;
    for (let i = 0; i < pcm.length; i++) {
      for (let ch = 0; ch < pcm.numberOfChannels; ch++) {
        bytes.writeFloatLE(pcm.getChannelData(ch)[i],offset); offset += 4;
      }
    }
    hash.update(bytes); chunks++; last = eof;
  }
  assert.equal(reader.codec(),'ALAC');
  assert.equal(hash.digest('hex'),expected);
  assert(chunks > 1);
  assert(requests.every(([start,end]) => end < file.length && end - start + 1 < file.length));
  reader.stop();
  const cancelled = context.M4AReader.open('fixture',audio);
  cancelled.next(() => assert.fail('callback after stop'));
  cancelled.stop();
  await Promise.resolve();
  assert(aborted);
  aborted = false; status = 200;
  const unsupported = context.M4AReader.open('fixture',audio);
  assert.match(await new Promise(resolve => unsupported.next(resolve)),/byte-range/);
  assert(aborted);
  unsupported.stop();
}
(async () => {
  for (const [name,hash] of fixtures) await verify(name,hash);
  console.log('PASS: M4A head/tail indexes, bounded requests, cancellation, 16-bit mono and 24-bit stereo ALAC PCM match FFmpeg.');
})().catch(error => { console.error(error); process.exitCode = 1; });
