const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={Uint8Array,Int8Array,Int16Array,Int32Array,Uint16Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer};c.window=c;
vm.createContext(c);
for(const name of ['aurora','flac'])vm.runInContext(fs.readFileSync('subsonic-tv/js/vendor/'+name+'.js','utf8'),c);
function block(type,size){const b=Buffer.alloc(size+4);b[0]=type;b.writeUIntBE(size,1,3);return b;}
const info=block(0,34);info.writeUInt16BE(4096,4);info.writeUInt16BE(4096,6);
const payload=Buffer.from([255,248,123,12,19]);
for(const last of [false,true]){
  const padding=block(last?129:1,70000),tail=last?Buffer.alloc(0):block(129,11);
  const bytes=Buffer.concat([Buffer.from('fLaC'),info,padding,tail,payload]);
  for(const firstSize of [44,65536]){
    const source=new c.AV.EventEmitter(),initial=new c.AV.Buffer(new Uint8Array(bytes.subarray(0,firstSize)));
    const demuxer=new (c.AV.Demuxer.find(initial))(source,initial),output=[],errors=[];
    demuxer.on('data',b=>output.push(Buffer.from(b.data)));demuxer.on('error',e=>errors.push(e));
    demuxer.readChunk();assert.equal(output.length,0,'metadata must not escape as audio');
    for(let i=firstSize;i<bytes.length;i+=65536)source.emit('data',new c.AV.Buffer(new Uint8Array(bytes.subarray(i,i+65536))));
    assert.deepEqual(errors,[]);assert.deepEqual(Buffer.concat(output),payload);
  }
}
console.log('PASS: FLAC metadata headers and final/non-final block bodies spanning byte ranges.');
