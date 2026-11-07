const fs=require('fs'),vm=require('vm'),assert=require('assert');
const storage={},nodes={},requests=[];let deny=false,reloads=0,stops=0;
function el(){return {childNodes:[],style:{},className:'',_text:'',set textContent(v){this._text=v;this.childNodes=[];},get textContent(){return this._text;},appendChild(n){this.childNodes.push(n);}};}
const original={url:'http://one.test:4533/music',username:'one',token:'a'.repeat(32),salt:'one-salt'};
storage['subsonic-tv-settings-v1']=JSON.stringify({server:original});
const c={SUBSONIC_CONFIG:{},localStorage:{getItem(k){return storage[k];},setItem(k,v){if(deny)throw Error('full');storage[k]=v;}},document:{getElementById(id){return nodes[id]||(nodes[id]=el());},createElement:el},window:{location:{reload(){reloads++;}}},MusicPlayer:{stop(){stops++;}},MusicAPI:{request(m,p,cb,server){const r={m,p,cb,server,cancel(){this.cancelled=true;}};requests.push(r);return r;}}};
vm.createContext(c);const store=fs.readFileSync('subsonic-tv/js/settings-store.js','utf8');vm.runInContext(store,c);vm.runInContext(fs.readFileSync('subsonic-tv/js/settings-ui.js','utf8'),c);
const a=c.AppSettings,p=c.SettingsPanel;function key(code,text){p.handle({keyCode:code,key:text});}function down(n){for(let i=0;i<n;i++)key(40);}function edit(text){key(13);key(403);for(const ch of text)key(0,ch);down(6);for(let i=0;i<3;i++)key(39);key(13);}function rows(){return nodes['settings-list'].childNodes.map(n=>n.childNodes.map(x=>x.textContent));}
assert.equal(a.servers().length,1);assert.equal(c.SUBSONIC_CONFIG.url,original.url);assert.deepEqual(JSON.parse(JSON.stringify(a.parseAddress(original.url))),{address:'one.test/music',port:'4533',ssl:false,explicitSSL:true});
assert.equal(a.serverURL('music.test/path','',true),'https://music.test/path');assert.equal(a.serverURL('[2001:db8::1]/music','4533',false),'http://[2001:db8::1]:4533/music');
for(const bad of ['user:pass@host','ftp://host','host?q=x','host#x','host:65536','http://'])assert.equal(a.parseAddress(bad),null,bad);
for(const bad of ['0','-1','65536','abc','80/path'])assert.equal(a.serverURL('host',bad,false),'');
const second={url:'https://two.test/music',username:'two',token:'b'.repeat(32),salt:'two-salt'};assert(a.saveServer(second,-1));assert.equal(a.servers().length,2);assert.equal(c.SUBSONIC_CONFIG.url,original.url,'saving does not change the running API client');
deny=true;assert(!a.saveServer({...second,url:'https://failed.test'},1));assert.equal(a.servers()[1].url,second.url);deny=false;
// Selector pings only the selected server with that server's credentials.
p.open();key(13);down(6);key(13);key(40);key(13);assert.equal(requests.at(-1).server.token,second.token);assert.equal(requests.at(-1).server.url,second.url);assert.equal(stops,0);
requests.at(-1).cb('Offline');assert.equal(stops,0);assert.equal(c.SUBSONIC_CONFIG.url,original.url);
key(13);const cancelled=requests.at(-1);key(10009);assert(cancelled.cancelled);cancelled.cb(null);assert.equal(reloads,0);
key(13);requests.at(-1).cb(null);assert.equal(reloads,1);assert.equal(stops,1);vm.runInContext(store,c);assert.equal(c.SUBSONIC_CONFIG.url,second.url);assert.equal(c.AppSettings.servers().length,2);
// New connection uses no old token; host edits require a new password.
p.open();key(13);assert(rows().some(r=>r[0]==='SSL'&&r[1].includes('HTTPS')));edit('changed.test');down(5);key(13);assert(nodes['settings-message'].textContent.includes('password'));assert.equal(requests.at(-1).server.url,second.url);
p.open();key(13);down(6);key(13);down(10);key(38);key(13);assert.equal(nodes['settings-title'].textContent,'Server setup');edit('https://three.test:8443/subsonic');assert(rows().some(r=>r[0]==='Port'&&r[1]==='8443'));assert(rows().some(r=>r[0]==='SSL'&&r[1].includes('HTTPS')));down(3);edit('three');key(40);edit('new-password');key(40);key(13);assert.equal(requests.at(-1).server.url,'https://three.test:8443/subsonic');assert.notEqual(requests.at(-1).server.token,second.token);requests.at(-1).cb(null);assert.equal(c.AppSettings.servers().length,3);assert(!storage['subsonic-tv-settings-v1'].includes('new-password'));
assert(!c.AppSettings.removeServer(1),'active profile cannot be removed');assert(c.AppSettings.removeServer(0));assert.equal(c.AppSettings.servers().length,2);
for(let i=0;i<6;i++)assert(c.AppSettings.saveServer({...original,url:'http://extra'+i+'.test'},-1));assert.equal(c.AppSettings.servers().length,8);assert(!c.AppSettings.saveServer({...original,url:'http://ninth.test'},-1));
console.log('PASS: server migration, URL/IPv6/port/SSL validation, isolated tokens, failed/cancelled switches, edited-host password requirement, add/remove and eight-profile limit.');
