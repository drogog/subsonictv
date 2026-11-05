const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const storeSource=fs.readFileSync('subsonic-tv/js/settings-store.js','utf8');
let stored='',deny=false;
function element(){return {childNodes:[],_text:'',className:'',style:{},set textContent(v){this._text=v;this.childNodes=[];},get textContent(){return this._text;},appendChild(v){this.childNodes.push(v);}};}
const nodes={},calls=[];let reloaded=0;
const c={SUBSONIC_CONFIG:{url:'http://old.test',username:'old',token:'a'.repeat(32),salt:'salt'},localStorage:{getItem(){return stored;},setItem(k,v){if(deny)throw Error('blocked');stored=v;}},document:{getElementById(id){return nodes[id]||(nodes[id]=element());},createElement:element},window:{location:{reload(){reloaded++;}}},MusicPlayer:{stop(){}},MusicAPI:{request(m,p,cb,server){const r={cb,server,cancel(){this.cancelled=true;}};calls.push(r);return r;}}};
vm.createContext(c);vm.runInContext(storeSource,c);
for(const input of ['', 'abc','password#with$symbols','Živjo 世界 🎶','x'.repeat(55),'y'.repeat(56),'z'.repeat(64),'a'.repeat(1000)])assert.equal(c.subsonicMD5(input),crypto.createHash('md5').update(input).digest('hex'));
c.AppSettings.set('accent',2); c.AppSettings.apply(); assert(nodes.theme.textContent.includes('#88baff')); assert.equal(JSON.parse(stored).accent,2);
assert.equal(c.AppSettings.values.quality,0);assert(c.AppSettings.set('quality',1));assert.equal(JSON.parse(stored).quality,1);assert(!c.AppSettings.set('quality',5));assert.equal(c.AppSettings.values.bitrate,192);assert(c.AppSettings.set('bitrate',320));assert(!c.AppSettings.set('bitrate',999));
assert(!c.AppSettings.set('accent',99)); assert(!c.AppSettings.saveServer({url:'javascript:bad'}));
vm.runInContext(fs.readFileSync('subsonic-tv/js/settings-ui.js','utf8'),c);
const panel=c.SettingsPanel;function press(code,key){panel.handle({keyCode:code,key});}
panel.open();
const initialRows = nodes['settings-list'].childNodes.slice();
press(40);
initialRows.forEach((row,i)=>assert.strictEqual(nodes['settings-list'].childNodes[i],row,'moving focus reuses settings rows'));
assert.equal(initialRows[1].className,'setting-row focused');
const oldFade = initialRows[1].childNodes[1].textContent;
press(39);
assert.strictEqual(nodes['settings-list'].childNodes[1],initialRows[1],'changing a value reuses its row');
assert.notEqual(initialRows[1].childNodes[1].textContent,oldFade,'reused row reflects changed setting');
for(let i=0;i<5;i++)press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Audio quality');
press(39);assert.equal(c.AppSettings.values.quality,2);press(39);assert.equal(c.AppSettings.values.quality,3);press(39);assert.equal(c.AppSettings.values.quality,4);
press(40);press(39);assert.equal(c.AppSettings.values.bitrate,64);press(37);assert.equal(c.AppSettings.values.bitrate,320);
press(38);press(39);assert.equal(c.AppSettings.values.quality,0);press(40);press(39);assert.equal(c.AppSettings.values.bitrate,320,'original does not change bitrate');
press(10009);assert.equal(nodes['settings-title'].textContent,'Settings');press(10009);assert(!panel.isOpen());
function edit(value){press(13);press(403);for(const ch of value)press(0,ch);for(let i=0;i<6;i++)press(40);for(let i=0;i<3;i++)press(39);press(13);}
panel.open();press(13);edit('new.test/music');press(40);edit('4533');press(40);press(40);edit('newuser');press(40);edit('sample#secret');
assert(!nodes['settings-list'].childNodes.some(n=>JSON.stringify(n).includes('sample#secret')));
press(40);press(13);assert.equal(c.SUBSONIC_CONFIG.url,'http://old.test');assert.equal(calls[0].server.url,'http://new.test:4533/music');
assert.equal(calls[0].server.token,crypto.createHash('md5').update('sample#secret'+calls[0].server.salt).digest('hex'));
calls[0].cb('Authentication failed');assert.equal(JSON.parse(stored).server.url,'http://old.test');assert.equal(reloaded,0);
press(13);press(10009);assert(calls[1].cancelled);calls[1].cb(null);assert.equal(reloaded,0);
press(13);deny=true;calls[2].cb(null);assert.equal(reloaded,0);assert.equal(JSON.parse(stored).server.url,'http://old.test');
deny=false;press(13);calls[3].cb(null);assert.equal(reloaded,1);assert(!stored.includes('sample#secret'));
vm.runInContext(storeSource,c);assert.equal(c.SUBSONIC_CONFIG.url,'http://new.test:4533/music');
console.log('PASS: UTF-8 MD5, safe persisted settings, remote keyboard, masked password, isolated ping, failed/cancelled save and successful token-only save.');
assert.equal(c.AppSettings.values.engine,0);assert(!c.AppSettings.set('engine',2));assert(!c.AppSettings.set('visualizer',7));assert(!c.AppSettings.set('effect',5));
panel.open();for(let i=0;i<7;i++)press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Visualization');const display=c.AppSettings.values.display;press(39);assert.equal(c.AppSettings.values.display,(display+1)%4);press(40);press(39);assert.equal(c.AppSettings.values.visualizer,1);press(40);press(39);assert.equal(c.AppSettings.values.effect,1);press(10009);press(38);press(13);for(let i=0;i<3;i++)press(40);press(13);assert.equal(c.AppSettings.values.engine,1);press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Settings');
vm.runInContext(storeSource,c);assert.equal(c.AppSettings.values.engine,1);assert.equal(c.AppSettings.values.visualizer,1);assert.equal(c.AppSettings.values.effect,1);
console.log('PASS: remote visualization preferences, effects, compatibility engine, bounds and persisted settings.');
assert.equal(c.AppSettings.values.sensitivity,0);assert.equal(c.AppSettings.values.saturation,1);assert(!c.AppSettings.set('sensitivity',7));assert(!c.AppSettings.set('saturation',2));
panel.open();for(let i=0;i<7;i++)press(40);press(13);for(let i=0;i<3;i++)press(40);press(37);assert.equal(c.AppSettings.values.sensitivity,-6);assert(nodes['settings-message'].textContent.toLowerCase().includes('audio volume'));press(40);press(13);assert.equal(c.AppSettings.values.saturation,0);assert(nodes['settings-message'].textContent.includes('does not measure audio distortion'));press(40);assert.equal(c.AppSettings.values.keepAwake,1);press(13);assert.equal(c.AppSettings.values.keepAwake,2);press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Settings');
press(40);press(40);press(40);press(40);press(13);assert.equal(nodes['settings-title'].textContent,'About SubsonicTV');assert(nodes['settings-list'].childNodes.some(n=>n.textContent==='Created by Dramak'));assert(nodes['settings-list'].childNodes.some(n=>n.textContent.includes('Music streams from your server')));press(10009);assert.equal(nodes['settings-title'].textContent,'Settings');assert(nodes['settings-list'].childNodes.some(n=>n.className==='setting-row focused' && n.childNodes[0].textContent==='About'));assert(nodes['settings-panel'].className.includes('compact'));press(13);press(13);assert.equal(nodes['settings-title'].textContent,'Settings');
vm.runInContext(storeSource,c);assert.equal(c.AppSettings.values.sensitivity,-6);assert.equal(c.AppSettings.values.saturation,0);
console.log('PASS: sensitivity and saturation controls, persistence, About author/copy and remote return focus.');

assert(!c.AppSettings.set("keepAwake",3));assert.equal(c.AppSettings.values.keepAwake,2);console.log("PASS: keep-screen-awake option and persistence.");
panel.open();for(let i=0;i<9;i++)press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Track Mix');assert(nodes['settings-message'].textContent.includes('200-song'));press(39);assert.equal(c.AppSettings.values.mixMode,1);assert.equal(nodes['settings-list'].childNodes.length,2);press(39);assert.equal(c.AppSettings.values.mixMode,2);const genreCall=calls[calls.length-1];assert.equal(genreCall.server,undefined);genreCall.cb(null,{genres:{genre:[{value:'Rock'},{value:'Jazz'}]}});assert.equal(c.AppSettings.values.mixGenre,'Jazz');assert.equal(nodes['settings-list'].childNodes.length,3);press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Choose genre');press(40);press(13);assert.equal(c.AppSettings.values.mixGenre,'Rock');press(10009);press(38);press(39);assert.equal(c.AppSettings.values.theme,1);assert.equal(nodes.stage.className,'theme-1');vm.runInContext(storeSource,c);assert.equal(c.AppSettings.values.mixGenre,'Rock');assert.equal(c.AppSettings.values.mixMode,2);assert.equal(c.AppSettings.values.theme,1);assert(!c.AppSettings.set('mixMode',3));assert(!c.AppSettings.set('theme',3));assert(c.AppSettings.set('display',3));
console.log('PASS: default/random/genre Mix settings, conditional genre picker, selection, themes and persistence.');

panel.open();for(let i=0;i<5;i++)press(40);assert(nodes['settings-list'].childNodes.some(n=>n.className==='setting-row focused' && n.childNodes[0].textContent==='Default fullscreen'));for(const expected of [0,1,2,3]){press(39);assert.equal(c.AppSettings.values.display,expected);}for(let i=0;i<20;i++)press(40);assert.equal(nodes['settings-list'].childNodes.slice(-1)[0].childNodes[0].textContent,'About');vm.runInContext(storeSource,c);assert.equal(c.AppSettings.values.display,3);console.log('PASS: all four fullscreen defaults accessible directly, persisted, and About is last.');

panel.open();for(let i=0;i<10;i++)press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Listening preferences');press(39);assert.equal(c.AppSettings.values.autoFullscreen,30);press(40);press(39);assert.equal(c.AppSettings.values.repeat,1);press(39);assert.equal(c.AppSettings.values.repeat,2);press(40);press(39);assert.equal(c.AppSettings.values.restoreSession,0);press(40);press(39);assert.equal(c.AppSettings.values.normalization,1);press(39);assert.equal(c.AppSettings.values.normalization,2);press(40);press(13);assert.equal(nodes['settings-title'].textContent,'Settings');press(40);press(13);assert.equal(nodes['settings-title'].textContent,'About SubsonicTV');vm.runInContext(storeSource,c);assert.equal(c.AppSettings.values.autoFullscreen,30);assert.equal(c.AppSettings.values.repeat,2);assert.equal(c.AppSettings.values.normalization,2);assert(!c.AppSettings.set('autoFullscreen',1));assert(!c.AppSettings.set('normalization',3));console.log('PASS: listening preferences, persistence, bounds and About remains last.');

panel.open(null,'visualizer');press(40);const startStyle=c.AppSettings.values.visualizer;for(let i=0;i<7;i++)press(39);assert.equal(c.AppSettings.values.visualizer,startStyle);press(40);const startEffect=c.AppSettings.values.effect;for(let i=0;i<5;i++)press(39);assert.equal(c.AppSettings.values.effect,startEffect);console.log('PASS: all seven styles and five effects cycle through settings.');
