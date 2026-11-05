const fs = require('fs'), vm = require('vm'), assert = require('assert');
function element() { return {childNodes:[],style:{},className:'',_text:'',
  set textContent(v){this._text=v;this.childNodes=[];},get textContent(){return this._text;},
  appendChild(v){this.childNodes.push(v);},removeChild(v){this.childNodes.splice(this.childNodes.indexOf(v),1);},setAttribute(){},removeAttribute(){}}; }
const nodes={},requests=[]; let key,queued,radio;
const context={SUBSONIC_CONFIG:{url:'mock',username:'test',token:'test',salt:'test'},
  document:{getElementById(id){return nodes[id]||(nodes[id]=element());},createElement:element,createTextNode(v){return v;},addEventListener(n,fn){key=fn;}},
  window:{innerWidth:1280,innerHeight:720,addEventListener(){}},
  MusicAPI:{url(){return 'mock';},request(method,params,callback){const r={method,params,callback,cancel(){this.cancelled=true;}};requests.push(r);return r;}},
  TrackMix:{build(items){return items.slice(0,50);},remember(){}},
  AppSettings:{values:{mixMode:0,theme:0,mixGenre:""},apply(){}}, SettingsPanel:{handle(){return false;},open(){}}, ArtworkView:{update(){},handle(){return false;},open(){}},
  MusicPlayer:{listen(){},queue(items,index){queued={items,index};},radio(items,index){radio={items,index};}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('subsonic-tv/js/catalog.js','utf8'),context);vm.runInContext(fs.readFileSync('subsonic-tv/js/app.js','utf8'),context);
function press(code){key({keyCode:code,preventDefault(){}});}
function reply(data){requests[requests.length-1].callback(null,data);}
const albums=Array.from({length:8},(_,i)=>({id:String(i),name:'Album '+i,artist:'Artist'}));
reply({albumList2:{album:albums}}); assert.equal(nodes.list.childNodes.length,8);
const firstNode=nodes.list.childNodes[0]; press(39); assert.strictEqual(nodes.list.childNodes[0],firstNode,'focus must reuse nodes');
press(405); assert.equal(requests[1].params.offset,8); reply({albumList2:{album:albums}});
press(404); assert.equal(requests[2].params.offset,0); reply({albumList2:{album:albums}});
press(10009); press(40); press(40); press(13); assert.equal(requests[3].method,'getArtists');
const artists=Array.from({length:20},(_,i)=>({id:String(i),name:'Artist '+i,albumCount:1}));
reply({artists:{index:[{artist:artists}]}}); press(405); assert.equal(nodes.counter.textContent,'8 / 20');
press(13); const abandoned=requests[4]; press(10009); assert(abandoned.cancelled);
abandoned.callback(null,{artist:{album:[{id:'stale'}]}}); assert.equal(nodes.heading.textContent,'Artists');
assert.equal(nodes.counter.textContent,'8 / 20');
press(13); requests[5].callback('Offline'); assert(nodes.notice.textContent.includes('retry'));
press(13); reply({artist:{album:[albums[0]]}});
press(13); reply({album:{song:[{id:'song',title:'Song'}]}});
press(13); assert.equal(queued.items[0].id,'song'); assert.equal(nodes.library.className,'hidden');
press(10009); press(10009); press(10009); assert.equal(nodes.counter.textContent,'8 / 20');
press(10009); press(40); press(13); assert.equal(requests[requests.length-1].method,'getPlaylists');
reply({playlists:{playlist:[{id:'playlist',name:'Mix',songCount:2}]}});
press(13); assert.equal(requests[requests.length-1].method,'getPlaylist');
reply({playlist:{entry:[{id:'second',title:'Second'},{id:'first',title:'First'}]}});
press(13); assert.deepEqual(queued.items.map(t=>t.id),['second','first']);
console.log('PASS: grid reuse, server paging, sidebar, stale requests, retry, restored focus, album and playlist queues.');
press(10009); press(10009); press(10009); press(40); press(13);
assert.equal(requests[requests.length-1].method,'getInternetRadioStations');
reply({internetRadioStations:{internetRadioStation:[{id:'r1',name:'Station',streamUrl:'http://radio.test/live'}]}});
press(13); assert.equal(radio.items[0].id,'r1'); assert.equal(nodes.library.className,'hidden');
press(10009); press(10009); press(40); press(13);
assert.equal(requests[requests.length-1].method,'getRandomSongs');
assert.equal(requests[requests.length-1].params.size,200);
reply({randomSongs:{song:[{id:'mix1',title:'Mix track'}]}});
assert.equal(queued.items[0].id,'mix1'); assert.equal(nodes.library.className,'hidden');
press(10009);
assert.equal(nodes.heading.textContent,'Your track mix');
assert.equal(nodes.list.childNodes.length,1,'Back from autoplay must draw the completed mix, not its empty loading page');
assert.equal(nodes.list.childNodes[0].childNodes[1].textContent,'Mix track');
const mixRow = nodes.list.childNodes[0], mixRequests = requests.length;
press(13); press(10009);
assert.strictEqual(nodes.list.childNodes[0],mixRow,'returning again preserves the rendered mix');
assert.equal(requests.length,mixRequests,'Back must not fetch a new mix');
press(10009); press(13); const cancelledMix=requests[requests.length-1];
press(10009); assert(cancelledMix.cancelled);
cancelledMix.callback(null,{randomSongs:{song:[{id:'late'}]}}); assert.equal(queued.items[0].id,'mix1');
console.log('PASS: radio selection, one-click Track Mix, and cancellation without replacing playback.');

press(40);press(13);assert.equal(requests[requests.length-1].method,'search3');assert.equal(requests[requests.length-1].params.query,'');const all=Array.from({length:7},(_,i)=>({id:'all'+i,title:'All '+i}));reply({searchResult3:{song:all}});press(405);assert.equal(requests[requests.length-1].params.songOffset,7);reply({searchResult3:{song:all.slice(0,2)}});press(404);reply({searchResult3:{song:all}});press(38);assert(nodes['shuffle-control'].className.includes('focused'));press(13);assert.equal(requests[requests.length-1].params.songCount,500);const big=Array.from({length:500},(_,i)=>({id:'all'+i,title:'All '+i}));reply({searchResult3:{song:big}});assert.equal(requests[requests.length-1].params.songOffset,500);reply({searchResult3:{song:[{id:'last',title:'Last'}]}});assert.equal(queued.items.length,501);assert.equal(new Set(queued.items.map(t=>t.id)).size,501);
press(10009);press(38);press(13);const cancelledCatalog=requests[requests.length-1];press(10009);assert(cancelledCatalog.cancelled);cancelledCatalog.callback(null,{searchResult3:{song:[{id:'bad'}]}});assert.equal(queued.items.length,501);
press(10009);press(38);context.AppSettings.values.mixMode=2;context.AppSettings.values.mixGenre='Jazz';press(13);assert.equal(requests[requests.length-1].params.genre,'Jazz');assert.equal(requests[requests.length-1].params.size,50);reply({randomSongs:{song:[{id:'jazz',title:'Jazz'}]}});assert.equal(queued.items[0].id,'jazz');press(10009);press(10009);context.AppSettings.values.mixMode=1;press(13);assert.equal(requests[requests.length-1].params.genre,undefined);reply({randomSongs:{song:[{id:'random'}]}});
context.AppSettings.values.theme=1;press(40);press(40);assert(nodes.navigation.childNodes[7].className.includes('focused'));press(37);assert(nodes.navigation.childNodes[6].className.includes('focused'));press(13);assert.equal(nodes.heading.textContent,'All songs');press(10009);press(38);assert(!nodes.navigation.childNodes[6].className.includes('focused'));
console.log('PASS: All Songs paging/full-library shuffle, cancellation, genre/random Mix modes and horizontal dock navigation.');
context.AppSettings.values.theme=0;press(10009);for(let i=0;i<5;i++)press(38);press(13);reply({albumList2:{album:[{id:'shuffle-album',name:'Album'}]}});press(13);const albumSongs=[{id:'aa',title:'A'},{id:'bb',title:'B'},{id:'cc',title:'C'}];reply({album:{song:albumSongs}});press(38);assert(nodes['shuffle-control'].className.includes('focused'));press(13);assert.equal(queued.items.length,3);assert.deepEqual([...queued.items.map(t=>t.id)].sort(),['aa','bb','cc']);assert.deepEqual(albumSongs.map(t=>t.id),['aa','bb','cc']);console.log('PASS: album Shuffle button creates a complete queue without changing album order.');
