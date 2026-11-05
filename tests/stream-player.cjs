const fs=require('fs'),vm=require('vm'),assert=require('assert');
const events={},engines=[];let state;
const html={paused:true,currentTime:0,duration:120,volume:1,addEventListener(n,f){(events[n]||(events[n]=[])).push(f);},removeEventListener(n,f){events[n]=(events[n]||[]).filter(x=>x!==f);},getAttribute(n){return this[n];},removeAttribute(n){delete this[n];},load(){this.currentTime=0;},play(){this.paused=false;emit('loadedmetadata');emit('playing');},pause(){this.paused=true;emit('pause');}};
function emit(n){for(const f of (events[n]||[]).slice())f();}
const c={window:{AudioContext:function(){}},document:{getElementById(){return html;}},SUBSONIC_CONFIG:{},AppSettings:{values:{quality:0,engine:0,fade:0}},MusicAPI:{url(m,p){return p.id;}},StreamDecoder:{unlock(){},start(url,options){
  const e={url,options,at:0,paused:false,stopped:false,gain:options.volume,position(){return this.at;},stats(){return {};},spectrum(){return [10,20];},waveform(){return [128,150];},volume(v){this.gain=v;},pause(){this.paused=true;options.onupdate({state:'Paused',playedSeconds:this.at});},resume(){this.paused=false;this.ready();},stop(){this.stopped=true;options.onend({state:'Stopped',playedSeconds:this.at});},ready(){options.onupdate({state:'Playing',playedSeconds:this.at});},end(){options.onend({state:'Complete',playedSeconds:120});},fail(){options.onend({state:'Error',playedSeconds:this.at,error:'Bad frame'});}};engines.push(e);return e;
}}};
vm.createContext(c);for(const name of ['stream-audio','player'])vm.runInContext(fs.readFileSync('subsonic-tv/js/'+name+'.js','utf8'),c);
const p=c.MusicPlayer;p.listen(s=>state=s);const tracks=[{id:'a',suffix:'flac',duration:120},{id:'b',suffix:'mp3',duration:130}];
p.queue(tracks,0);assert.equal(engines.length,1);assert(!html.src);assert(html.paused);assert.equal(engines[0].options.seconds,undefined);engines[0].ready();assert.equal(state.state,'Playing');assert(p.analysisAvailable());assert.deepEqual(p.spectrum(),[10,20]);assert.deepEqual(p.waveform(),[128,150]);assert.equal(state.duration,120);
const first=engines[0];first.at=11;p.pause();assert(first.paused);assert.equal(state.state,'Paused');p.play();assert(!first.paused);assert.equal(engines.length,1);assert.equal(p.status().time,11);assert.equal(state.state,'Playing');
p.analysis(true);p.analysis(false);assert.equal(engines.length,1);assert(!first.stopped,'opening and closing fullscreen must not restart playback');
p.previous();assert(first.stopped);assert.equal(engines.length,2);assert.equal(p.status().time,0);engines[1].ready();engines[1].end();assert.equal(state.index,1);assert.equal(engines.length,3);engines[2].ready();
first.options.onupdate({state:'Playing',playedSeconds:80});assert.equal(state.time,0,'old callbacks must be ignored');
engines[2].at=12;engines[2].fail();assert.equal(html.src,'b');assert.equal(html.currentTime,12);assert.equal(state.state,'Playing');assert(!p.analysisAvailable());assert(engines[2].stopped);
p.queue(tracks,0);engines[3].ready();p.radio([{id:'r',name:'Radio',streamUrl:'http://radio.test/live'}],0);assert(engines[3].stopped);assert.equal(html.src,'http://radio.test/live');assert.equal(state.duration,0);
c.AppSettings.values.quality=1;p.queue(tracks,0);assert.equal(engines.length,4);assert.equal(html.src,'a');c.AppSettings.values.quality=0;c.AppSettings.values.engine=1;p.queue(tracks,0);assert.equal(engines.length,4);
c.AppSettings.values.engine=0;p.queue([{id:'aac',suffix:'m4a'}],0);assert.equal(engines.length,4);
p.queue(tracks,1);engines[4].ready();engines[4].end();assert.equal(state.state,'Finished');p.play();assert.equal(engines.length,6);engines[5].ready();p.stop();assert(engines[5].paused);assert.equal(state.state,'Stopped');
console.log('PASS: streaming queue, duration, pause/resume, restart, EOF/advance, stale callbacks, no fullscreen handover, fallback at position, radio, quality and compatibility mode.');
p.queue(tracks,0);const mixEngine=engines.at(-1),engineCount=engines.length;mixEngine.ready();mixEngine.at=46;
assert(p.replaceUpcoming([{id:'mix-next',suffix:'mp3'}],p.status(),'Track mix'));
assert.equal(engines.length,engineCount);assert(!mixEngine.stopped);assert(!mixEngine.paused);assert.equal(p.status().time,46);assert.equal(p.tracks()[1].id,'mix-next');
console.log('PASS: applying a mix keeps the incremental decoder and current PCM stream running.');
