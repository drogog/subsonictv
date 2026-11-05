const fs=require('fs'),vm=require('vm'),assert=require('assert');
function harness(options={}){
  let status='NONE',now=100,seq=0,prepare=[],seek=[],events,bandCallback,opens=0,closes=0,lastURL='',lastSeek,loads=0,lastState;
  const timers=new Map(),calls=[];
  const av={getState(){return status;},close(){status='NONE';closes++;},stop(){status='IDLE';},open(url){assert.equal(status,'NONE');lastURL=url;status='IDLE';opens++;},
    setListener(listener){events=listener;},setSoundAnalysisListener(listener){assert.equal(status,'IDLE');calls.push('register');if(options.reject){let e=Error();e.name='NotSupportedError';throw e;}if(options.objectOnly&&typeof listener==='function'){let e=Error();e.name='TypeMismatchError';throw e;}bandCallback=listener;},unsetSoundAnalysisListener(){},
    prepareAsync(ok,error){assert.equal(status,'IDLE');calls.push('prepare');prepare.push({ok,error});},getDuration(){return 180000;},
    seekTo(ms,ok,error){lastSeek=ms;seek.push({ok,error});},play(){assert(['READY','PAUSED','PLAYING'].includes(status));status='PLAYING';calls.push('play');},pause(){assert.equal(status,'PLAYING');status='PAUSED';}};
  const htmlEvents={};const html={paused:true,currentTime:0,duration:180,volume:1,src:'',
    addEventListener(n,fn){(htmlEvents[n]||(htmlEvents[n]=[])).push(fn);},removeEventListener(n,fn){htmlEvents[n]=(htmlEvents[n]||[]).filter(f=>f!==fn);},emit(n){for(const fn of (htmlEvents[n]||[]).slice())fn();},
    getAttribute(n){return this[n];},removeAttribute(n){delete this[n];},load(){loads++;this.currentTime=0;this.emit('loadedmetadata');},play(){this.paused=false;this.emit('playing');},pause(){this.paused=true;this.emit('pause');}};
  const c={webapis:{avplay:av},window:{},navigator:{userAgent:'Tizen 2.4.0'},document:{getElementById(){return html;}},Uint8Array,Date:{now(){return now;}},
    setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},setInterval(){throw Error('Native playback must not use software fade timers');},clearInterval(){},
    SUBSONIC_CONFIG:{},AppSettings:{values:{quality:0,fade:0}},MusicAPI:{url(m,p){return 'http://music/'+p.id+'?format='+p.format;}}};
  vm.createContext(c);for(const file of ['native-audio','player'])vm.runInContext(fs.readFileSync('subsonic-tv/js/'+file+'.js','utf8'),c);
  const p=c.MusicPlayer;p.listen(s=>lastState=s);
  return {p,c,html,av,options,timers,calls,prepare,seek,get opens(){return opens;},get loads(){return loads;},get status(){return status;},get state(){return lastState;},get url(){return lastURL;},get lastSeek(){return lastSeek;},
    ready(i=prepare.length-1){status='READY';prepare[i].ok();},seekDone(){seek[seek.length-1].ok();},bands(values){if(typeof bandCallback==='function')bandCallback(values);else bandCallback.ongetbandsarray(values);},get event(){return events;},get bandsCallback(){return bandCallback;},advance(ms){now+=ms;}};
}
let h=harness();h.p.queue([{id:'flac'},{id:'second'}],0);h.html.currentTime=42;const url=h.html.src;h.c.AppSettings.values.fade=500;
assert(h.p.analysisAvailable());h.p.analysis(true);assert.equal(h.url,url,'native must use the same quality URL');assert(h.html.paused);assert(!h.html.src);assert.deepEqual(h.calls,['register','prepare']);assert.equal(h.p.spectrum(),null);
h.ready();assert.equal(h.lastSeek,42000);h.seekDone();assert.equal(h.status,'PLAYING');assert.equal(h.state.duration,180);assert.equal(h.state.time,42);assert.equal(h.timers.size,0);
h.bands([0,-35,70,140]);assert.deepEqual(Array.from(h.p.spectrum()),[0,128,255,255]);assert(h.p.analysisStatus().includes('4 bands'));
const openCount=h.opens,loadCount=h.loads;h.p.analysis(false);h.p.analysis(true);assert.equal(h.opens,openCount);assert.equal(h.loads,loadCount,'fullscreen toggles must not reload playback');
h.p.pause();assert.equal(h.status,'PAUSED');assert.equal(h.p.spectrum(),null);h.p.play();assert.equal(h.status,'PLAYING');
h.p.previous();assert.equal(h.lastSeek,0);h.seekDone();assert.equal(h.state.time,0);
h.p.next();h.ready();assert.equal(h.url,'http://music/second?format=raw');assert.equal(h.status,'PLAYING');assert.equal(h.opens,2);assert.equal(h.state.index,1);
h.advance(6000);assert(h.p.analysisStatus().includes('no band callbacks'));assert.equal(h.status,'PLAYING','missing analysis must not interrupt native audio');
h.p.radio([{id:'r',name:'Radio',streamUrl:'http://station/live'}],0);h.ready();assert.equal(h.state.duration,0);assert.equal(h.url,'http://station/live');h.p.pause();assert.equal(h.status,'NONE');h.p.play();h.ready();assert.equal(h.status,'PLAYING');assert.equal(h.url,'http://station/live');
console.log('PASS: same-stream native handover, IDLE registration, seek restoration, spectrum normalization, uninterrupted fullscreen toggling, pause/resume, queue and radio controls.');
h=harness({reject:true});h.p.queue([{id:'one'}],0);h.html.currentTime=23;let loads=h.loads;h.p.analysis(true);assert.equal(h.loads,loads);assert(!h.html.paused);assert.equal(h.html.currentTime,23);assert(h.p.analysisStatus().includes('NotSupportedError'));assert(!h.p.analysisAvailable());
h=harness({objectOnly:true});h.p.queue([{id:'one'}],0);h.p.analysis(true);h.ready();h.bands([35]);assert.equal(h.p.spectrum()[0],128);
h.event.oncurrentplaytime(31000);h.event.onerror('failed');assert(!h.html.paused);assert.equal(h.html.currentTime,31);assert.equal(h.html.src,'http://music/one?format=raw');assert(h.p.analysisStatus().includes('normal playback restored'));assert.equal(h.status,'NONE');
h=harness();h.p.queue([{id:'one'}],0);h.p.analysis(true);h.p.pause();h.ready();assert.equal(h.status,'READY');assert.equal(h.state.state,'Paused');h.p.play();assert.equal(h.status,'PLAYING');
h=harness();h.p.queue([{id:'one'},{id:'two'}],0);h.p.analysis(true);const stale=h.prepare[0],staleBands=h.bandsCallback;h.p.next();stale.ok();assert(!h.calls.includes('play'),'cancelled preparation must not start the old track');h.ready();staleBands([70]);assert.equal(h.p.spectrum(),null,'old track bands must be ignored');
h=harness();h.p.queue([{id:'one'}],0);h.html.currentTime=9;h.p.analysis(true);for(const fn of [...h.timers.values()])fn();assert.equal(h.status,'NONE');assert(!h.html.paused);assert.equal(h.html.currentTime,9);assert.equal(h.timers.size,0);
console.log('PASS: unsupported API leaves HTML playback untouched, alternate callback shape, native-error recovery, pause during prepare, stale callback rejection and timeout recovery.');
