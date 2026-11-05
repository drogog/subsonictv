const fs=require('fs'),vm=require('vm'),assert=require('assert');let current,now=0,timer=0,signal=true,state;const timers=new Map();
const parent={replaceChild(next){current=next;next.parentNode=parent;}};
function audio(){const listeners={};return {parentNode:parent,paused:true,currentTime:0,duration:100,volume:1,
  addEventListener(n,fn){(listeners[n]||(listeners[n]=[])).push(fn);},removeEventListener(n,fn){listeners[n]=(listeners[n]||[]).filter(x=>x!==fn);},emit(n){for(const fn of (listeners[n]||[]).slice())fn();},
  getAttribute(k){return this[k];},removeAttribute(k){delete this[k];},load(){this.paused=true;this.currentTime=0;this.emit('loadedmetadata');},play(){this.paused=false;this.emit('playing');},pause(){this.paused=true;this.emit('pause');}};}
current=audio();const c={window:{},Uint8Array,Date:{now(){return now;}},setInterval(fn){timers.set(++timer,fn);return timer;},clearInterval(id){timers.delete(id);},document:{getElementById(){return current;},createElement:audio},SUBSONIC_CONFIG:{},MusicAPI:{url(m,p){return p.id;}}};
vm.createContext(c);vm.runInContext(fs.readFileSync('subsonic-tv/js/player.js','utf8'),c);let p=c.MusicPlayer;p.listen(s=>state=s);
p.queue([{id:'one'},{id:'two'}],0);const original=current;p.analysis(true);assert.equal(current,original);assert(p.analysisStatus().includes('unavailable'));
let connections=0,closed=0;
c.window.AudioContext=function(){this.destination={};this.createAnalyser=()=>({frequencyBinCount:512,getByteFrequencyData(arr){arr.fill(signal?100:0);},connect(){connections++;},disconnect(){}});this.createMediaElementSource=element=>{assert(!element.src,'attach graph before loading media');assert.equal(element.crossOrigin,'anonymous');return {connect(){connections++;},disconnect(){}};};this.close=()=>{closed++;};};
current.currentTime=23;p.analysis(true);assert.notEqual(current,original);assert.equal(connections,2);assert.equal(current.currentTime,23);assert.equal(current.crossOrigin,'anonymous');assert(p.spectrum()[0]>0);
p.analysis(false);assert.notEqual(current,original);assert.equal(current.currentTime,23);assert(!current.paused);assert.equal(timers.size,0);assert(closed>0);
const restored=current;p.next();assert.equal(current.src,'two');assert.equal(current.currentTime,0,'old seek listener must not affect next track');
restored.currentTime=8;p.analysis(true);signal=false;for(let i=0;i<34;i++){now+=250;for(const fn of [...timers.values()])fn();}
assert(p.analysisStatus().includes('normal playback restored'));assert(!p.spectrum());assert(!current.paused);assert.equal(current.src,'two');
const failedPlayer=current;assert(!p.analysisAvailable());p.analysis(true);assert.equal(current,failedPlayer);assert.equal(timers.size,0);assert(p.analysisStatus().includes('unavailable'));
current=audio();vm.runInContext(fs.readFileSync('subsonic-tv/js/player.js','utf8'),c);p=c.MusicPlayer;p.queue([{id:'two'}],0);
signal=true;p.analysis(true);current.error={code:4};current.emit('error');assert(p.analysisStatus().includes('normal playback restored'));assert(!current.paused);
p.radio([{id:'r',name:'Radio',streamUrl:'http://radio/live'}],0);p.analysis(true);assert(p.analysisStatus().includes('library tracks'));assert.equal(current.src,'http://radio/live');
console.log('PASS: optional audio-path hook, signal data, original-path recovery, seek restoration, zero-signal and error fallback, radio bypass.');
let probeSignal=false,stopped=0,muteValue,failAttach=false;
c.window.AudioContext=function(){this.destination={};this.createAnalyser=()=>({test:false,frequencyBinCount:512,getByteFrequencyData(arr){arr.fill((this.test?probeSignal:signal)?100:0);},connect(){},disconnect(){this.test=false;}});this.createGainNode=()=>({gain:{set value(v){muteValue=v;}},connect(){},disconnect(){}});this.createOscillator=()=>({frequency:{},connect(target){target.test=true;},disconnect(){},noteOn(){},noteOff(){stopped++;}});this.createMediaElementSource=element=>{assert(!element.src);if(failAttach)throw Error('failed');return {connect(){},disconnect(){}};};this.close=()=>{closed++;};};
function tick(n){for(let i=0;i<n;i++){now+=250;for(const fn of [...timers.values()])fn();}}
p.queue([{id:'test'}],0);let plain=current;p.analysis(true);assert.equal(muteValue,0);assert.equal(current,plain);assert.equal(p.spectrum(),null,'never expose synthetic probe as music');tick(6);assert.equal(current,plain);assert(!current.paused);assert(p.analysisStatus().includes('Analyser test: no samples'));assert.equal(timers.size,0);
p.analysis(true);p.analysis(false);tick(8);assert.equal(timers.size,0);assert.equal(current,plain);assert(stopped>=2);
p.analysis(true);p.queue([{id:'changed'}],0);tick(8);assert.equal(timers.size,0);assert.equal(current.src,'changed','track switch cancels pending probe');
probeSignal=true;current.currentTime=17;p.analysis(true);tick(1);assert.notEqual(current,plain);assert.equal(current.currentTime,17);assert(!current.paused);assert(p.spectrum()[0]>0);assert(p.analysisStatus().includes('Analyser OK'));
p.analysis(false);
failAttach=true;current.currentTime=31;p.analysis(true);assert(p.analysisStatus().includes('Hook failed'));assert.equal(current.src,'changed');assert.equal(current.currentTime,31);assert(!current.paused);assert.equal(timers.size,0);
failAttach=false;p.analysis(true);signal=false;tick(34);assert(!p.analysisAvailable());assert(p.analysisStatus().includes('normal playback restored'));assert(!current.paused);assert.equal(current.src,'changed');
plain=current;p.analysis(false);p.analysis(true);p.queue([{id:'new-song'}],0);p.analysis(true);assert.equal(current,plain);assert.equal(timers.size,0,'failed bridge must not retry on entry or track change');
console.log('PASS: muted legacy analyser probe, probe cancellation, fresh-element hook, position preservation and hook-construction recovery.');
for(const ua of ['Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1','Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4)']){
  current=audio();c.navigator={userAgent:ua};c.window.AudioContext=function(){throw Error('Legacy TV must never create a graph');};
  vm.runInContext(fs.readFileSync('subsonic-tv/js/player.js','utf8'),c);p=c.MusicPlayer;p.queue([{id:'flac'}],0);plain=current;current.currentTime=35;
  assert(!p.analysisAvailable());p.analysis(true);assert(p.analysisStatus().includes('unavailable'));assert.equal(current,plain);assert.equal(current.currentTime,35);assert(!current.paused);assert.equal(timers.size,0);
  p.analysis(false);p.analysis(true);assert.equal(current,plain);assert.equal(current.currentTime,35);
}
console.log('PASS: Tizen 2.4 spectrum entry/exit leaves original playback and position untouched.');
