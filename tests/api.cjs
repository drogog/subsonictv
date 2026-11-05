const fs=require('fs'),vm=require('vm'),assert=require('assert');
let xhr,callbackCount=0;
function XHR(){xhr=this;this.open=(m,u)=>{this.url=u;};this.send=()=>{};this.abort=()=>{this.aborted=true;};}
const c={SUBSONIC_CONFIG:{url:'http://old.test',username:'old',token:'old-token',salt:'old-salt',client:'tv'},XMLHttpRequest:XHR,setTimeout(){return 1;},clearTimeout(){}};
vm.runInNewContext(fs.readFileSync('subsonic-tv/js/api.js','utf8'),c);
const req=c.MusicAPI.request('ping',{},()=>{callbackCount++;},{url:'http://new.test/base',username:'new user',token:'new-token',salt:'new-salt'});
assert(xhr.url.startsWith('http://new.test/base/rest/ping.view?'));assert(xhr.url.includes('u=new%20user'));assert(!xhr.url.includes('old-token'));assert.equal(c.SUBSONIC_CONFIG.url,'http://old.test');
req.cancel();xhr.status=200;xhr.responseText='{"subsonic-response":{"status":"ok"}}';xhr.onload();assert.equal(callbackCount,0);
c.MusicAPI.request('ping',{},()=>{callbackCount++;});xhr.status=200;xhr.responseText='{"subsonic-response":{"status":"ok"}}';xhr.onload();xhr.onerror();assert.equal(callbackCount,1);
console.log('PASS: candidate server credential isolation, cancelled response suppression and single callback.');
