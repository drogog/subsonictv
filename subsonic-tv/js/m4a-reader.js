/* Read one bounded piece of an indexed MP4 audio track at a time. The native
   decoder receives a complete miniature M4A, including its original codec setup. */
var M4AReader = (function () {
  'use strict';
  var MAX_INDEX = 2 * 1024 * 1024, MAX_PACKETS = 262144, MAX_BATCH = 256 * 1024;
  function check(ok, message) { if (!ok) { throw new Error(message || 'Invalid M4A sample table'); } }
  function number(bytes, offset) {
    check(offset >= 0 && offset + 4 <= bytes.length);
    return bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
  }
  function type(bytes, offset) { return String.fromCharCode.apply(null,bytes.subarray(offset,offset + 4)); }
  function words(values) {
    var bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer), i;
    for (i = 0; i < values.length; i++) { view.setUint32(i * 4,values[i]); }
    return bytes;
  }
  function join(parts) {
    var length = 0, offset = 0, i;
    for (i = 0; i < parts.length; i++) { length += parts[i].length; }
    var result = new Uint8Array(length);
    for (i = 0; i < parts.length; i++) { result.set(parts[i],offset); offset += parts[i].length; }
    return result;
  }
  function box(name, parts) {
    var length = 8, i;
    for (i = 0; i < parts.length; i++) { length += parts[i].length; }
    return join([words([length]),new Uint8Array([name.charCodeAt(0),name.charCodeAt(1),name.charCodeAt(2),name.charCodeAt(3)])].concat(parts));
  }
  function children(bytes, wanted) {
    var result = [], offset = 0, length;
    while (offset < bytes.length) {
      length = number(bytes,offset);
      check(length >= 8 && length <= bytes.length - offset);
      if (type(bytes,offset + 4) === wanted) { result.push(bytes.subarray(offset + 8,offset + length)); }
      offset += length;
    }
    return result;
  }
  function child(bytes, wanted) {
    var found = children(bytes,wanted);
    check(found.length === 1,'Missing or repeated M4A box: ' + wanted);
    return found[0];
  }
  function codecName(description) {
    var entry = type(description,12);
    if (entry === 'alac') { return 'ALAC'; }
    check(entry === 'mp4a','Unsupported M4A audio entry ' + entry);
    // MPEG-4 Audio sample entries may also contain MP3. Inspect DecoderConfigDescriptor.
    check(description[24] === 0 && description[25] === 0,'Unsupported audio sample entry version');
    var esds = child(description.subarray(44),'esds'), pos = 4;
    function descriptor(tag) {
      check(esds[pos++] === tag,'Unsupported MPEG-4 audio descriptor');
      var n = 0, b;
      do { check(pos < esds.length && n++ < 4); b = esds[pos++]; } while (b & 128);
    }
    descriptor(3); pos += 2;
    var flags = esds[pos++];
    if (flags & 128) { pos += 2; }
    if (flags & 64) { pos += 1 + esds[pos]; }
    if (flags & 32) { pos += 2; }
    descriptor(4);
    check([0x40,0x66,0x67,0x68].indexOf(esds[pos]) >= 0,'Unsupported MPEG-4 audio codec');
    return 'AAC';
  }
  function index(track, fileSize) {
    var mdia = child(track,'mdia');
    if (type(child(mdia,'hdlr'),8) !== 'soun') { return null; }
    var mdhd = child(mdia,'mdhd'), scale = number(mdhd,mdhd[0] === 1 ? 20 : 12);
    var table = child(child(mdia,'minf'),'stbl'), description = child(table,'stsd');
    check(number(description,4) === 1);
    var codec = codecName(description), edits = children(track,'edts'), priming = 0;
    if (edits.length) {
      var edit = child(edits[0],'elst');
      check(number(edit,4) === 1,'Unsupported M4A edit sequence');
      if (edit[0] === 1) { check(number(edit,16) === 0); }
      priming = number(edit,edit[0] === 1 ? 20 : 12);
      check(priming < scale,'Unsupported M4A edit offset');
    }
    check(scale > 0 && scale <= 192000);
    var sizes = child(table,'stsz'), count = number(sizes,8), constant = number(sizes,4);
    check(count > 0 && count <= MAX_PACKETS,'M4A track exceeds index limit');
    var starts = new Float64Array(count), lengths = new Uint32Array(count), ticks = new Uint32Array(count);
    var times = child(table,'stts'), runs = number(times,4), packet = 0, run, repeat, duration, j;
    for (run = 0; run < runs; run++) {
      repeat = number(times,8 + run * 8); duration = number(times,12 + run * 8);
      check(repeat > 0 && repeat <= count - packet && duration > 0 && duration <= scale);
      for (j = 0; j < repeat; j++) { ticks[packet++] = duration; }
    }
    check(packet === count);
    var mapping = child(table,'stsc'), maps = number(mapping,4);
    var wide = children(table,'co64'), offsets = wide.length ? wide[0] : child(table,'stco');
    var chunks = number(offsets,4), chunk, pos, offset, perChunk;
    check(maps > 0 && chunks <= count && number(mapping,8) === 1);
    packet = 0; run = 0;
    for (chunk = 1; chunk <= chunks; chunk++) {
      if (run + 1 < maps && number(mapping,8 + (run + 1) * 12) === chunk) { run++; }
      perChunk = number(mapping,12 + run * 12);
      check(perChunk > 0 && perChunk <= count - packet && number(mapping,16 + run * 12) === 1);
      pos = 8 + (chunk - 1) * (wide.length ? 8 : 4);
      offset = wide.length ? number(offsets,pos) * 4294967296 + number(offsets,pos + 4) : number(offsets,pos);
      for (j = 0; j < perChunk; j++) {
        lengths[packet] = constant || number(sizes,12 + packet * 4);
        check(lengths[packet] && lengths[packet] <= MAX_BATCH && offset + lengths[packet] <= fileSize);
        starts[packet] = offset; offset += lengths[packet++];
      }
    }
    check(packet === count);
    var config = codec === 'ALAC' ? new Uint8Array(child(description.subarray(44),'alac')) : null;
    return {codec:codec,alacConfig:config,priming:priming,description:new Uint8Array(description),scale:scale,starts:starts,lengths:lengths,ticks:ticks};
  }
  var matrix = [65536,0,0,0,65536,0,0,0,1073741824];
  function segment(info, packets) {
    var sizes = [], times = [], parts = [], duration = 0, i;
    for (i = 0; i < packets.length; i++) {
      parts.push(packets[i].bytes); sizes.push(parts[i].length); times.push(1,packets[i].ticks); duration += packets[i].ticks;
    }
    var ftyp = box('ftyp',[words([0x4d344120,0,0x69736f6d,0x6d703432])]);
    var media = box('mdat',parts);
    var table = box('stbl',[box('stsd',[info.description]),box('stts',[words([0,packets.length].concat(times))]),
      box('stsc',[words([0,1,1,packets.length,1])]),box('stsz',[words([0,0,packets.length].concat(sizes))]),
      box('stco',[words([0,1,ftyp.length + 8])])]);
    var dinf = box('dinf',[box('dref',[words([0,1]),box('url ',[words([1])])])]);
    var mdia = box('mdia',[box('mdhd',[words([0,0,0,info.scale,duration,0x55c40000])]),
      box('hdlr',[words([0,0,0x736f756e,0,0,0,0])]),box('minf',[box('smhd',[words([0,0])]),dinf,table])]);
    var track = box('trak',[box('tkhd',[words([7,0,0,1,0,duration,0,0,0,0x01000000].concat(matrix,[0,0]))]),mdia]);
    var movie = box('moov',[box('mvhd',[words([0,0,0,info.scale,duration,65536,0x01000000,0,0].concat(matrix,[0,0,0,0,0,0,2]))]),track]);
    return join([ftyp,media,movie]).buffer;
  }
  function open(url, context) {
    var info, total, consumedTicks = 0, packet = 0, history = [], xhr, stopped = false, boxCount = 0, downloaded = 0;
    var queued = [], lastBatch = false;
    function range(offset, length, done) {
      var req = new XMLHttpRequest(); xhr = req;
      function reject(message) { if (xhr !== req || stopped) { return; } xhr = null; req.abort(); done(message); }
      req.open('GET',url,true); req.responseType = 'arraybuffer'; req.timeout = 10000;
      req.setRequestHeader('Range','bytes=' + offset + '-' + (offset + length - 1));
      req.onreadystatechange = function () {
        if (stopped || xhr !== req) { return; }
        if (req.readyState >= 2 && req.status !== 206) { reject('M4A requires byte-range support'); return; }
        if (req.readyState !== 4) { return; }
        var bytes = new Uint8Array(req.response || 0), match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(req.getResponseHeader('Content-Range') || '');
        if (!match || +match[1] !== offset || +match[2] !== offset + length - 1 || +match[3] < offset + length || +match[3] > 9007199254740991 || bytes.length !== length || (total && total !== +match[3])) { reject('Invalid M4A range response'); return; }
        xhr = null; total = +match[3]; downloaded += length; done(null,bytes);
      };
      req.onprogress = function (event) { if (event.loaded > length) { reject('Oversized M4A response'); } };
      req.onerror = req.ontimeout = function () { reject('M4A range request failed'); };
      req.send();
    }
    function locate(offset, done, movieEnd) {
      if (++boxCount > 256 || total && offset + 8 > (movieEnd || total)) { done('Missing M4A audio index'); return; }
      range(offset,8,function (error, header) {
        if (error) { done(error); return; }
        function visit(length, headerSize) {
          if (length < headerSize || length > (movieEnd || total) - offset) { done('Invalid M4A atom size'); return; }
          var name = type(header,4);
          if (!movieEnd && name === 'moov') { locate(offset + headerSize,done,offset + length); return; }
          if (!movieEnd || name !== 'trak') { locate(offset + length,done,movieEnd); return; }
          if (length <= headerSize || length > MAX_INDEX) { done('M4A index exceeds memory limit'); return; }
          range(offset + headerSize,length - headerSize,function (err, bytes) {
            if (err) { done(err); return; }
            try { info = index(bytes,total); } catch (e) { done(e.message); return; }
            if (info) { batch(done); } else { locate(offset + length,done,movieEnd); }
          });
        }
        var length = number(header,0);
        if (length === 1) {
          range(offset + 8,8,function (err, ext) { if (err) { done(err); } else { visit(number(ext,0) * 4294967296 + number(ext,4),16); } });
        } else { visit(length || total - offset,8); }
      });
    }
    function emitALAC(done) {
      var part = queued.shift(), buffer;
      try {
        buffer = ALACPacket.decode(part.bytes,info.alacConfig,context);
        var skip = Math.min(part.ticks,Math.max(0,info.priming - consumedTicks));
        var first = Math.round(skip * buffer.sampleRate / info.scale);
        var end = Math.round(part.ticks * buffer.sampleRate / info.scale);
        check(end <= buffer.length,'Invalid ALAC packet duration');
        consumedTicks += part.ticks;
        if (first < end && (first || end < buffer.length)) {
          var trimmed = context.createBuffer(buffer.numberOfChannels,end - first,buffer.sampleRate);
          for (var ch = 0; ch < buffer.numberOfChannels; ch++) { trimmed.getChannelData(ch).set(buffer.getChannelData(ch).subarray(first,end)); }
          buffer = trimmed;
        }
      } catch (error) { done(error.message); return; }
      if (first === end) {
        if (lastBatch && !queued.length) { done('Empty M4A edit'); } else { next(done); }
        return;
      }
      done(null,buffer,lastBatch && !queued.length);
    }
    function next(done) {
      if (queued.length) { emitALAC(done); }
      else if (info) { batch(done); }
      else { locate(0,done); }
    }
    function batch(done) {
      var start = packet, bytes = 0, duration = 0, priorTicks = 0, i;
      while (packet < info.ticks.length && duration < info.scale * 0.75 && packet - start < 256) {
        if (info.starts[packet] !== info.starts[start] + bytes || bytes + info.lengths[packet] > MAX_BATCH) { break; }
        duration += info.ticks[packet]; bytes += info.lengths[packet++];
      }
      for (i = 0; i < history.length; i++) { priorTicks += history[i].ticks; }
      range(info.starts[start],bytes,function (error, payload) {
        if (error) { done(error); return; }
        var packets = history.slice(), cursor = 0, j, length;
        for (j = start; j < packet; j++) {
          length = info.lengths[j]; packets.push({bytes:payload.subarray(cursor,cursor + length),ticks:info.ticks[j]}); cursor += length;
        }
        if (info.codec === 'ALAC') {
          queued = packets; lastBatch = packet === info.ticks.length; emitALAC(done); return;
        }
        // Supply AAC overlap/resampler warm-up without re-fetching any audio.
        history = packets.slice(-2).map(function (p) { return {bytes:new Uint8Array(p.bytes),ticks:p.ticks}; });
        try {
          context.decodeAudioData(segment(info,packets),function (buffer) {
            if (stopped) { return; }
            var rate = buffer.sampleRate, skip = Math.round(priorTicks * rate / info.scale);
            var initialTrim = Math.min(duration,Math.max(0,info.priming - consumedTicks));
            var outputStart = Math.max(info.priming,consumedTicks);
            consumedTicks += duration;
            skip += Math.round(initialTrim * rate / info.scale);
            var wanted = Math.max(0,Math.round(consumedTicks * rate / info.scale) - Math.round(outputStart * rate / info.scale));
            if (!wanted) { if (packet < info.ticks.length) { batch(done); } else { done('Empty M4A edit'); } return; }
            var frames = Math.min(buffer.length - skip,wanted);
            if (frames <= 0 || frames < wanted - 4 || buffer.numberOfChannels > 2) { done('Unsupported M4A decoder timing or channels'); return; }
            var pcm = context.createBuffer(buffer.numberOfChannels,frames,rate);
            for (var ch = 0; ch < pcm.numberOfChannels; ch++) { pcm.getChannelData(ch).set(buffer.getChannelData(ch).subarray(skip,skip + frames)); }
            done(null,pcm,packet === info.ticks.length);
          },function () { if (!stopped) { done('TV cannot decode this M4A ' + info.codec + ' stream'); } });
        } catch (e) { done(e.message); }
      });
    }
    return {next:next,
      bytes:function () { return downloaded; },codec:function () { return info ? info.codec : ''; },
      stop:function () { stopped = true; if (xhr) { xhr.abort(); xhr = null; } info = null; history = []; queued = []; }};
  }
  return {open:open};
}());
