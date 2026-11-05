const fs=require('fs'),vm=require('vm'),assert=require('assert');
let saved='',seed=42;
const math=Object.create(Math); math.random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
const context={SUBSONIC_CONFIG:{url:'http://test',username:'user'},Math:math,localStorage:{getItem(){return saved;},setItem(k,v){saved=v;}}};
vm.runInNewContext(fs.readFileSync('subsonic-tv/js/mix.js','utf8'),context);
const mix=context.TrackMix,tracks=Array.from({length:100},(_,i)=>({id:String(i),artist:'Artist '+(i%20)}));
let result=mix.build(tracks.concat(tracks,[{id:'video',isVideo:true}]),50);
assert.equal(result.length,50); assert.equal(new Set(result.map(t=>t.id)).size,50); assert(!result.some(t=>t.id==='video'));
assert.equal(mix.build([],50).length,0); assert.equal(mix.build(tracks.slice(0,3),50).length,3);
mix.remember({id:'recent'}); let counts={recent:0,fresh:0};
for(let i=0;i<1000;i++){counts[mix.build([{id:'recent'},{id:'fresh'}],1)[0].id]++;}
assert(counts.fresh>counts.recent*5);
counts={starred:0,ordinary:0};
for(let i=0;i<1000;i++){counts[mix.build([{id:'starred',starred:'yes',userRating:5},{id:'ordinary'}],1)[0].id]++;}
assert(counts.starred>counts.ordinary*3);
for(let i=0;i<220;i++){mix.remember({id:'history'+i});}
assert.equal(Object.keys(JSON.parse(saved)).length,200);
mix.remember({id:'station',radio:true}); assert(!JSON.parse(saved).$station);
console.log('PASS: unique bounded mixes, small libraries, recent-play avoidance, preference weighting and bounded local history.');
