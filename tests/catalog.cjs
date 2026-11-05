const fs=require('fs'),vm=require('vm'),assert=require('assert');const calls=[];
const c={MusicAPI:{request(method,params,cb){const r={method,params,cb,cancel(){this.cancelled=true;}};calls.push(r);return r;}}};vm.runInNewContext(fs.readFileSync('subsonic-tv/js/catalog.js','utf8'),c);
let result,error,progress=[];const songs=Array.from({length:500},(_,i)=>({id:''+i,title:'Song '+i,suffix:'flac',largeField:'discard'}));
c.MusicCatalog.all((e,r)=>{error=e;result=r;},n=>progress.push(n));calls[0].cb(null,{searchResult3:{song:songs}});assert.equal(calls[1].params.songOffset,500);calls[1].cb(null,{searchResult3:{song:[{id:'500',title:'Last'},{id:'0',title:'Duplicate'}]}});assert.equal(result.length,501);assert(!result[0].largeField);assert.equal(error,null);assert.deepEqual(progress,[0,500]);
const shuffled=c.MusicCatalog.shuffle(result.concat(result));assert.equal(shuffled.length,501);assert.equal(new Set(shuffled.map(t=>t.id)).size,501);assert.equal(result[0].id,'0');
let completed=false;const task=c.MusicCatalog.all(()=>completed=true);const last=calls[calls.length-1];task.cancel();last.cb(null,{searchResult3:{song:songs}});assert(last.cancelled);assert(!completed);
c.MusicCatalog.all(e=>error=e);calls[calls.length-1].cb(null,{searchResult3:{song:songs}});calls[calls.length-1].cb(null,{searchResult3:{song:songs}});assert(error.includes('repeated'));
console.log('PASS: complete paged catalog, compact metadata, deduplicated shuffle, no source mutation, cancellation and repeated-page guard.');
