const fs=require('fs'),vm=require('vm'),assert=require('assert');
function harness(available=true){
 const events={},calls=[],timers=new Map();let id=0;
 const c={document:{hidden:false,addEventListener(n,f){events[n]=f;}},window:{addEventListener(n,f){events[n]=f;}},AppSettings:{values:{keepAwake:1}},setTimeout(f){timers.set(++id,f);return id;},clearTimeout(i){timers.delete(i);}};
 if(available)c.webapis={appcommon:{AppCommonScreenSaverState:{SCREEN_SAVER_OFF:0,SCREEN_SAVER_ON:1},setScreenSaver(value,ok,fail){calls.push({value,ok,fail});}}};
 vm.runInNewContext(fs.readFileSync('subsonic-tv/js/screen-awake.js','utf8'),c);
 return {c,p:c.ScreenAwake,events,calls,timers};
}
let h=harness();h.p.update({state:'Playing'});assert.equal(h.calls[0].value,0);h.calls[0].ok();for(let i=0;i<20;i++)h.p.update({state:'Playing'});assert.equal(h.calls.length,1,'time updates must not spam the platform');h.p.update({state:'Paused'});assert.equal(h.calls[1].value,1);h.calls[1].ok();h.p.update({state:'Buffering'});h.calls[2].ok();h.c.document.hidden=true;h.events.visibilitychange();assert.equal(h.calls[3].value,1);h.calls[3].ok();h.c.document.hidden=false;h.events.visibilitychange();assert.equal(h.calls[4].value,0);h.calls[4].ok();h.p.release();assert.equal(h.calls[5].value,1);h.calls[5].ok();assert.equal(h.timers.size,0);
h=harness();h.c.AppSettings.values.keepAwake=2;h.p.update({state:'Stopped'});assert.equal(h.calls[0].value,0);h.calls[0].ok();h.c.AppSettings.values.keepAwake=0;h.p.refresh();assert.equal(h.calls[1].value,1);h.calls[1].ok();h.p.update({state:'Playing'});assert.equal(h.calls.length,2);
h=harness();h.p.update({state:'Playing'});h.p.update({state:'Paused'});assert.equal(h.calls.length,1);h.calls[0].ok();assert.equal(h.calls[1].value,1,'pending OFF must be followed by ON when paused');h.calls[1].ok();assert(h.p.status().includes('allowed'));
h=harness();h.p.update({state:'Playing'});h.events.pagehide();assert.equal(h.calls[1].value,1);h.calls[0].ok();h.calls[1].ok();assert(h.p.status().includes('allowed'),'late callbacks must not revive the lock after exit');
h=harness();h.p.update({state:'Playing'});h.calls[0].fail({name:'NotSupportedError'});h.p.update({state:'Playing'});assert.equal(h.calls.length,1);assert(h.p.status().includes('NotSupportedError'));h.c.document.hidden=true;h.events.visibilitychange();assert.equal(h.calls[1].value,1);h.calls[1].ok();
h=harness();h.p.update({state:'Playing'});[...h.timers.values()][0]();assert(h.p.status().includes('Timeout'));h.p.update({state:'Playing'});assert.equal(h.calls.length,1);h.p.release();assert.equal(h.calls[1].value,1);
h=harness(false);h.p.update({state:'Playing'});assert(h.p.status().includes('unavailable'));assert.equal(h.timers.size,0);
console.log('PASS: screen-awake modes, no call flooding, pause/hide/exit restoration, queued/stale callbacks, timeout and unsupported-device handling.');
