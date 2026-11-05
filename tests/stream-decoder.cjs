const fs=require('fs'),vm=require('vm'),assert=require('assert');
function harness(status=206,chunkLimit=65536,partialFrames=false,seconds=5){
  let now=0,id=0,lastStat,done;const tasks=new Map(),requests=[],sources=[];let analyser,gainNode,firstEncoded;
  const frames=44100*35,bytes=Buffer.alloc(44+frames*4);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(176400,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);for(let i=0;i<frames;i++){const v=Math.round(Math.sin(i*440*2*Math.PI/44100)*10000);bytes.writeInt16LE(v,44+i*4);bytes.writeInt16LE(v,46+i*4);}
  function later(fn,delay){tasks.set(++id,{fn,at:now+(delay||1)});return id;}
  function Context(){this.currentTime=0;this.destination={};this.createAnalyser=()=>(analyser={frequencyBinCount:512,minDecibels:-100,maxDecibels:-30,signalDb:-18,connect(){},disconnect(){},getByteFrequencyData(a){a.fill(Math.max(0,Math.min(255,Math.round((this.signalDb-this.minDecibels)/(this.maxDecibels-this.minDecibels)*255))));}});this.createGain=()=>(gainNode={gain:{value:1},connect(){},disconnect(){}});this.createBuffer=(channels,length,rate)=>({numberOfChannels:channels,length,duration:length/rate,data:Array.from({length:channels},()=>new Float32Array(length)),getChannelData(c){return this.data[c];}});this.createBufferSource=()=>{const n={connect(to){this.to=to;},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(n);return n;};context=this;}
  let context;
  function XHR(){this.readyState=0;this.status=0;this.aborted=false;this.open=()=>{};this.setRequestHeader=(n,v)=>{this.range=v;};this.abort=()=>{this.aborted=true;};this.send=()=>{requests.push(this);later(()=>{if(this.aborted)return;const m=/bytes=(\d+)-(\d+)/.exec(this.range),start=+m[1],end=+m[2]+1;this.status=start>=bytes.length?416:status;this.readyState=2;this.onreadystatechange();if(this.aborted)return;let buf=bytes.subarray(start,Math.min(end,start+chunkLimit,bytes.length));this.response=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);this.readyState=4;this.onreadystatechange();},20);};}
  const c={AppSettings:{values:{sensitivity:0}},console,Uint8Array,Float32Array,ArrayBuffer,Int8Array,Int16Array,Int32Array,Uint16Array,Uint32Array,Float64Array,XMLHttpRequest:XHR,Date:{now:()=>now},setTimeout:later,clearTimeout:i=>tasks.delete(i),setInterval:later,clearInterval:i=>tasks.delete(i),AudioContext:Context,performance:{now:()=>now}};c.window=c;c.global=c;
  vm.createContext(c);for(const name of ['vendor/aurora','vendor/mp3','vendor/flac'])vm.runInContext(fs.readFileSync('subsonic-tv/js/'+name+'.js','utf8'),c);
  const append=c.AV.BufferList.prototype.append;c.AV.BufferList.prototype.append=function(buffer){if(!firstEncoded)firstEncoded=buffer;return append.call(this,buffer);};
  if(partialFrames){
    // Model a compressed frame straddling a 64 KB range. Aurora's list counts
    // the entire current buffer, including the bytes already consumed from it.
    c.AV.Asset=function(source){
      const asset=new c.AV.EventEmitter();let remaining=0;
      const list={first:null,last:null};Object.defineProperty(list,'availableBytes',{get:()=>Math.ceil(remaining/65536)*65536});
      asset.decoder=new c.AV.EventEmitter();asset.decoder.waiting=false;
      asset.decoder.stream={list,remainingBytes:()=>remaining};
      asset.decoder.decode=function(){
        if(remaining<70000){this.waiting=true;return false;}
        remaining-=70000;this.waiting=false;asset.emit('data',new Float32Array(88200));return true;
      };
      source.on('data',buffer=>{remaining+=buffer.length;if(asset.decoder.waiting)asset.decoder.decode();});
      asset.start=()=>asset.emit('format',{sampleRate:44100,channelsPerFrame:2});asset.stop=()=>{};return asset;
    };
  }
  vm.runInContext(fs.readFileSync('subsonic-tv/js/stream-decoder.js','utf8'),c);
  const engine=c.StreamDecoder.start('test.wav',{seconds,volume:1,onupdate:s=>lastStat={...s},onend:s=>done={...s}});
  function tick(ms){const end=now+ms;for(let count=0;count<10000&&tasks.size;count++){let chosen=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(chosen[1].at>end)break;now=chosen[1].at;if(context)context.currentTime=now/1000;tasks.delete(chosen[0]);chosen[1].fn();engine.spectrum();}now=end;if(context)context.currentTime=now/1000;}
  return {engine,tick,requests,sources,tasks,bytes,analyser,gainNode,settings:c.AppSettings.values,get firstEncoded(){return firstEncoded;},get stat(){return lastStat;},get done(){return done;}};
}
let h=harness();h.tick(1500);assert(h.sources.length>0,'PCM buffers should be scheduled before whole-file download');assert(h.stat.decodedSeconds>0);assert(h.stat.downloadedBytes<h.bytes.length/3);assert(h.stat.maxRetainedBytes<3*1024*1024);assert(h.sources[0].buffer.data[0].some(x=>x!==0));h.tick(5000);assert.equal(h.done.state,'Complete');assert.equal(h.done.underruns,0);assert(h.done.peak>0);assert.equal(h.tasks.size,0);assert(h.sources[h.sources.length-1].stopped,'future queued audio must be stopped on completion');
h=harness(200);h.tick(30);assert.equal(h.done.state,'Error');assert(h.done.error.includes('byte ranges'));assert(h.requests[0].aborted);assert.equal(h.sources.length,0);
h=harness();h.tick(400);h.engine.stop();const count=h.requests.length;h.tick(5000);assert.equal(h.requests.length,count);assert.equal(h.tasks.size,0);assert.equal(h.done.state,'Stopped');
h=harness(206,65536,true);h.tick(7000);assert.equal(h.done && h.done.state,'Complete','a partial compressed frame must fetch another range instead of stalling');assert(h.done.requests>5);assert(h.done.playedSeconds>=5);
h=harness();h.tick(1500);h.engine.pause();const pausedAt=h.engine.position();h.tick(100);const pausedRequests=h.requests.length;h.tick(4000);assert.equal(h.requests.length,pausedRequests);assert.equal(h.engine.position(),pausedAt);assert.equal(h.engine.spectrum(),null);h.engine.resume();h.tick(5000);assert.equal(h.done.state,'Complete');assert.equal(h.done.underruns,0);assert(h.done.playedSeconds>=5);
h=harness(206,65536,false,null);h.tick(32000);assert(!h.done,'normal playback must continue past the 30-second benchmark limit');assert(h.engine.position()>30);h.tick(6000);assert.equal(h.done.state,'Complete');assert(Math.abs(h.done.playedSeconds-35)<0.001,'EOF must play the entire decoded tail');assert(h.done.maxRetainedBytes<3*1024*1024);
console.log('PASS: incremental real PCM decoding, bounded 64 KB requests/read-ahead, nonzero samples, scheduling, EOF/test completion, range refusal and cancellation.');

h=harness();assert.equal(h.analyser.maxDecibels,-12);h.analyser.signalDb=-24;const quieter=h.engine.spectrum()[0];h.analyser.signalDb=-18;const louder=h.engine.spectrum()[0];assert(louder>quieter && louder<255,"strong bins must retain motion above the old -30 dB ceiling");h.settings.sensitivity=12;assert.equal(h.engine.spectrum()[0],255);h.settings.sensitivity=-12;assert(h.engine.spectrum()[0]<255);assert.equal(h.analyser.maxDecibels,0);assert.equal(h.analyser.minDecibels,-78);assert.equal(h.gainNode.gain.value,1,"visual sensitivity must never change playback gain");h.engine.stop();console.log("PASS: pre-conversion sensitivity preserves loud-bin variation, updates live and leaves audio gain unchanged.");

h=harness(206,65536,false,null);h.tick(32000);let retainedFromFirst=0;for(let b=h.firstEncoded;b;b=b.next){retainedFromFirst+=b.length;}assert(retainedFromFirst<=65536*3,"a reference to the first compressed chunk must not retain the full forward chain");h.engine.stop();console.log("PASS: stale first-chunk references cannot retain the streamed track through forward links.");
