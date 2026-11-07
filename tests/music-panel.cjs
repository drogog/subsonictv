const fs=require('fs'),vm=require('vm'),assert=require('assert');
function element(){return {childNodes:[],className:'',_text:'',set textContent(v){this._text=v;this.childNodes=[];},get textContent(){return this._text;},appendChild(n){this.childNodes.push(n);}};}
const nodes={},requests=[];let tracks=[{id:'one',title:'One'},{id:'two',title:'Two'}],current=0,revision=0,played=[],enqueued=[],moved=[],removed=[];
const c={document:{getElementById(id){return nodes[id]||(nodes[id]=element());},createElement:element},MusicAPI:{request(m,p,cb){const r={m,p,cb,cancel(){this.cancelled=true;}};requests.push(r);return r;}},Listening:{favourite(t){return !!t.starred;},setFavourite(t,v){t.starred=v;}},MusicPlayer:{status(){return {index:current,track:tracks[current],revision,state:'Playing'};},tracks(){return tracks.slice();},queue(t){played.push(t);},jump(i){played.push(i);current=i;},enqueue(t,next){enqueued.push({t,next});},move(a,b){moved.push([a,b]);const t=tracks.splice(a,1)[0];tracks.splice(b,0,t);revision++;},remove(i){removed.push(i);tracks.splice(i,1);revision++;}}};
vm.createContext(c);vm.runInContext(fs.readFileSync('subsonic-tv/js/music-panel.js','utf8'),c);const p=c.MusicPanel;function key(code,text){p.handle({keyCode:code,key:text});}function response(data){requests.slice(-1)[0].cb(null,data);}function labels(){return nodes['music-list'].childNodes.map(n=>n.childNodes[0]&&n.childNodes[0].textContent);}
p.search();key(0,'B');key(0,'j');key(0,'ö');key(404);assert.equal(requests.slice(-1)[0].m,'search3');assert.equal(requests.slice(-1)[0].p.query,'Bjö');response({searchResult3:{artist:[{id:'ar',name:'Artist'}],album:[{id:'al',name:'Album'}],song:[{id:'s',title:'Song'}]}});assert.deepEqual(labels(),['Artist','Album','Song']);key(13);assert.equal(requests.slice(-1)[0].m,'getArtist');response({artist:{album:[{id:'al',name:'Album'}]}});key(13);assert.equal(requests.slice(-1)[0].m,'getAlbum');response({album:{song:[{id:'s',title:'Song'}]}});key(13);response({song:{id:'s'}});assert(labels().includes('Play next'));key(40);key(13);assert.equal(enqueued[0].next,true);key(40);key(13);assert.equal(enqueued[1].next,false);key(40);key(13);assert.equal(requests.slice(-1)[0].m,'star');response({});assert(labels().includes('Remove from favourites'));key(13);assert.equal(requests.slice(-1)[0].m,'unstar');response({});assert(labels().includes('Add to favourites'));
p.search();key(404);const old=requests.slice(-1)[0];key(10009);assert(old.cancelled);old.cb(null,{searchResult3:{song:[{id:'late',title:'Late'}]}});assert.equal(nodes['music-title'].textContent,'Search');key(10009);assert(!p.isOpen());
p.favourites();assert.equal(requests.slice(-1)[0].m,'getStarred2');response({starred2:{song:[{id:'fav',title:'Favourite'}]}});key(13);response({song:{id:'fav',starred:'today'}});assert(labels().includes('Remove from favourites'));
p.queue();assert.equal(nodes['music-title'].textContent,'Queue');key(39);assert.deepEqual(moved[0],[0,1]);key(404);assert.equal(played.slice(-1)[0],1);key(405);assert.deepEqual(removed,[1]);assert.equal(labels().length,1);key(13);response({song:{id:'one'}});assert(!labels().includes('Play next'),'queue actions do not duplicate an entry and invalidate its position');key(10009);assert.equal(nodes['music-title'].textContent,'Queue');key(10009);assert(!p.isOpen());
p.search();key(404);requests.slice(-1)[0].cb('Offline');assert(nodes['music-message'].textContent.includes('Offline'));key(10009);assert.equal(nodes['music-title'].textContent,'Search');
console.log('PASS: remote/Unicode search, artist/album browsing, queue actions, star/unstar, server favourites, cancellation, stale callbacks, queue move/remove and errors.');
c.setTimeout=()=>1;c.clearTimeout=()=>{};c.TrackMix={build(items,n){return items.slice(0,n);}};
for(const name of ['catalog','seed-mix'])vm.runInContext(fs.readFileSync('subsonic-tv/js/'+name+'.js','utf8'),c);
let playbackRevision=0,applied=0,mixLabel='';
c.MusicPlayer.status=()=>({index:current,track:tracks[current],count:tracks.length,revision,playbackRevision,state:'Playing',mixLabel});
c.MusicPlayer.replaceUpcoming=(songs,expected,label)=>{assert.equal(expected.revision,revision);tracks=tracks.slice(0,current+1).concat(songs);revision++;applied++;mixLabel=label;p.update();return true;};
const seed={id:'seed',title:'Seed song',album:'Seed album',artist:'Seed artist',albumId:'al',artistId:'ar',genre:'Jazz'};
tracks=[seed,{id:'old'}];current=0;
function openMix(){p.actions(seed,0);response({song:seed});assert(labels().includes('Start mix'));key(40);key(40);key(13);assert.equal(nodes['music-title'].textContent,'Start mix');assert(nodes['music-panel'].className.includes('mix-card'));}
openMix();key(13);const pending=requests.at(-1),count=requests.length;assert.equal(pending.m,'getSimilarSongs2');key(13);assert.equal(requests.length,count,'repeated OK does not start another mix');key(10009);assert(pending.cancelled);assert.equal(nodes['music-title'].textContent,'Seed song');assert.equal(nodes['music-list'].childNodes[2].className,'music-row focused','Back restores Start mix focus');pending.cb(null,{similarSongs2:{song:[{id:'late'}]}});assert.equal(applied,0);
key(13);key(13);const changed=requests.at(-1);revision++;p.update();assert(changed.cancelled);assert(nodes['music-message'].textContent.includes('cancelled'));changed.cb(null,{similarSongs2:{song:[{id:'late'}]}});assert.equal(applied,0);
openMix();key(13);response({similarSongs2:{song:[{id:'new',title:'New'}]}});assert.equal(applied,1);assert.deepEqual(tracks.map(t=>t.id),['seed','new']);assert.equal(nodes['music-title'].textContent,'Queue');assert(nodes['music-message'].textContent.includes('Track mix · Seed song'));key(10009);assert(!p.isOpen());
openMix();key(40);key(13);assert.equal(requests.at(-1).m,'getAlbum');requests.at(-1).cb('Offline');assert(nodes['music-message'].textContent.includes('unchanged'));assert.equal(applied,1);
openMix();key(13);const skipped=requests.at(-1);playbackRevision++;p.update();assert(skipped.cancelled);assert.equal(applied,1);
tracks=[{id:'missing',title:'Missing'}];p.actions(tracks[0],0);response({song:tracks[0]});key(40);key(40);key(13);key(40);const beforeDisabled=requests.length;key(13);assert.equal(requests.length,beforeDisabled);assert(nodes['music-message'].textContent.includes('album ID'));
tracks=[{id:'radio',radio:true,title:'Radio'}];p.actions(tracks[0],0);assert(!labels().includes('Start mix'));
console.log('PASS: seed menu navigation, disabled choices, radio exclusion, repeated OK, Back cancellation, stale queue/track guards and labelled result queue.');

const playing = {id:'playing',title:'Playing'};
const queuedSeed = {...seed,id:'queued',title:'Queued seed'};
tracks = [playing,queuedSeed,{id:'previous'}]; current = 0;
for (const index of [1,-1]) {
  p.actions(queuedSeed,index); response({song:queuedSeed});
  const startMix = labels().indexOf('Start mix');
  assert(startMix >= 0);
  for (let i = 0; i < startMix; i++) key(40);
  key(13); key(13);
  assert.equal(requests.at(-1).m,'getSimilarSongs2');
  assert.equal(requests.at(-1).p.id,queuedSeed.id);
  response({similarSongs2:{song:[playing,queuedSeed,{id:'previous'},{id:'different-'+index}]}});
  assert.equal(tracks[0],playing);
  assert.equal(tracks[1].id,'different-'+index);
  assert.equal(nodes['music-title'].textContent,'Queue');
  key(10009);
}
console.log('PASS: seed from a queue row or mix list while the currently playing song continues.');
