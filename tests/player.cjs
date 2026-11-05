const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const events = {};
let state, lastStreamParams;
const audio = {paused:true,currentTime:0,duration:100,
  addEventListener(name, fn) {events[name]=fn;},
  getAttribute(name) {return this[name];}, removeAttribute(name) {delete this[name];},
  load() {this.currentTime=0;},
  play() {this.paused=false;events.playing();},
  pause() {this.paused=true;events.pause();}}
const context = {document:{getElementById(){return audio;}},SUBSONIC_CONFIG:{},MusicAPI:{url(method,p){lastStreamParams=p;return p.id;}}};
vm.runInNewContext(fs.readFileSync('subsonic-tv/js/player.js','utf8'),context);
const player = context.MusicPlayer;
player.listen(value=>{state=value;});
player.queue([{id:'one'},{id:'two'}],0);
assert.equal(audio.src,'one'); assert.equal(state.state,'Playing');
assert.equal(lastStreamParams.format,'raw'); assert.equal(lastStreamParams.maxBitRate,0);
player.toggle(); assert(audio.paused);
player.toggle(); assert(!audio.paused);
events.ended(); assert.equal(audio.src,'two'); assert.equal(state.index,1);
events.ended(); assert.equal(state.state,'Finished'); assert.equal(state.index,1);
audio.currentTime=20; player.previous(); assert.equal(audio.currentTime,0); assert.equal(audio.src,'two');
player.previous(); assert.equal(audio.src,'one');
audio.error={code:4}; events.error(); assert.equal(state.state,'Audio error (code 4)');
console.log('PASS: queue playback, pause/resume, auto-advance, album end, previous and audio errors.');
player.radio([{id:'r1',name:'Radio',streamUrl:'http://station.test/live'},{id:'r2',name:'Radio 2',streamUrl:'https://station2.test/live'}],0);
assert.equal(audio.src,'http://station.test/live'); assert.equal(state.duration,0); assert(state.track.radio);
player.toggle(); assert(!audio.src); assert.equal(state.state,'Stopped');
player.toggle(); assert.equal(audio.src,'http://station.test/live');
player.next(); assert.equal(audio.src,'https://station2.test/live');
audio.currentTime=200; player.previous(); assert.equal(audio.src,'http://station.test/live');
events.ended(); assert.equal(state.state,'Station disconnected'); assert.equal(state.index,0);
player.radio([{id:'bad',name:'Bad',streamUrl:'file:///bad'}],0); player.play(); assert(!audio.src);
player.queue([{id:'music'}],0); assert.equal(audio.src,'music'); assert(!state.track.radio);
console.log('PASS: direct radio URL, live duration, stop/reconnect, station switching, invalid URLs and return to music.');
context.AppSettings={values:{quality:1,fade:0}};
player.queue([{id:'compatibility'}],0); assert.equal(lastStreamParams.format,'mp3'); assert.equal(lastStreamParams.maxBitRate,192);
context.AppSettings.values.quality=2; player.queue([{id:'server-default'}],0); assert.equal(lastStreamParams.format,undefined); assert.equal(lastStreamParams.maxBitRate,192);
context.SUBSONIC_CONFIG.streamFormat='ogg'; player.queue([{id:'legacy-config'}],0); assert.equal(lastStreamParams.format,'ogg');
context.AppSettings.values.quality=0; player.queue([{id:'original'}],0); assert.equal(lastStreamParams.format,'raw'); assert.equal(lastStreamParams.maxBitRate,0);
console.log('PASS: default original stream, MP3 compatibility, server-default quality and explicit original overriding legacy format.');
for(const [quality,format]of [[1,'mp3'],[3,'aac'],[4,'opus']]){for(const rate of [64,96,128,160,192,256,320]){context.AppSettings.values.quality=quality;context.AppSettings.values.bitrate=rate;player.queue([{id:'quality-test'}],0);assert.equal(lastStreamParams.format,format);assert.equal(lastStreamParams.maxBitRate,rate);}}
console.log('PASS: MP3, AAC and Opus bitrate presets.');
