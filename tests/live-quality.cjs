const fs=require('fs'),vm=require('vm');const ctx={};vm.runInNewContext(fs.readFileSync('subsonic-tv/js/config.js','utf8'),ctx);const c=ctx.SUBSONIC_CONFIG;
function url(method,params){const u=new URL(c.url+'/rest/'+method+'.view');u.search=new URLSearchParams({u:c.username,t:c.token,s:c.salt,v:'1.15.0',c:c.client,f:'json',...params});return u;}
(async()=>{
const r=await fetch(url('getRandomSongs',{size:30}),{signal:AbortSignal.timeout(10000)});const songs=(await r.json())['subsonic-response'].randomSongs.song;const song=songs.find(s=>s.suffix==='flac');if(!song)throw Error('No FLAC sample');
for(const mode of [{format:'mp3',rate:320},{format:'aac',rate:256},{format:'opus',rate:128},{format:'ogg',rate:192}]){
const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
try {const response=await fetch(url('stream',{id:song.id,format:mode.format,maxBitRate:mode.rate}),{headers:{Range:'bytes=0-2047'},signal:abort.signal});const reader=response.body.getReader();let bytes=Buffer.alloc(0);while(bytes.length<256){const chunk=await reader.read();if(chunk.done)break;bytes=Buffer.concat([bytes,Buffer.from(chunk.value)]);if(bytes.length>65536)break;}await reader.cancel();
let signature=bytes.includes(Buffer.from('OpusHead'))?'Opus':bytes.includes(Buffer.from('vorbis'))?'Vorbis':bytes.subarray(0,3).toString()==='ID3'?'MP3/ID3':bytes[0]===255&&(bytes[1]&246)===240?'AAC/ADTS':'MIME only';
console.log(mode.format+' '+mode.rate+': HTTP '+response.status+'; '+response.headers.get('content-type')+'; '+signature);
}finally{clearTimeout(timer);abort.abort();}
}})().catch(()=>{console.error('Quality probe failed; credentials omitted.');process.exitCode=1;});
