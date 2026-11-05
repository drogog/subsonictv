const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={Float32Array};vm.runInNewContext(fs.readFileSync('subsonic-tv/js/visualizer.js','utf8'),c);
let rects=0,lines=0,arcs=0;
function finite(...values){assert(values.every(Number.isFinite));}
const paint={fillRect(...v){finite(...v);rects++;},beginPath(){},moveTo(...v){finite(...v);},lineTo(...v){finite(...v);lines++;},stroke(){},arc(...v){finite(...v);arcs++;}};
for(const n of [31,512])for(let style=0;style<4;style++)for(let effect=0;effect<3;effect++){
  c.MusicVisualizer.reset();rects=lines=arcs=0;const data=new Uint8Array(n).fill(180),wave=new Uint8Array(1024).fill(150);
  c.MusicVisualizer.draw(paint,data,wave,style,effect,'#abcdef');assert.equal(paint.globalAlpha,1);assert(rects<=49&&lines<=159&&arcs<=1);
  if(style<2)assert.equal(rects,49);if(style===2)assert.equal(lines,159);if(style===3)assert.equal(arcs,1);
  c.MusicVisualizer.draw(paint,new Uint8Array(n),wave,style,effect,'#abcdef');
}
console.log('PASS: four canvas styles, all effects, bounded geometry, finite coordinates and short/full spectrum inputs.');
const redRects=[],redLines=[];const indicatorPaint={...paint,fillRect(...v){finite(...v);if(this.fillStyle==='#ff625f')redRects.push(v);},stroke(){if(this.strokeStyle==='#ff625f')redLines.push(true);}};
const loud=new Uint8Array(512);loud[1]=255;
for(const style of [0,1]){c.MusicVisualizer.reset();redRects.length=0;c.MusicVisualizer.draw(indicatorPaint,loud,null,style,0,'#abcdef',true);assert(redRects.length>0);assert(redRects.every(r=>r[3]<=3));redRects.length=0;c.MusicVisualizer.draw(indicatorPaint,loud,null,style,0,'#abcdef',false);assert.equal(redRects.length,0);c.MusicVisualizer.draw(indicatorPaint,new Uint8Array(512),null,style,0,'#abcdef',true);assert.equal(redRects.length,0,'decaying bars must not falsely indicate current saturation');}
c.MusicVisualizer.draw(indicatorPaint,loud,null,3,0,'#abcdef',true);assert(redLines.length>0);
redLines.length=0;c.MusicVisualizer.draw(indicatorPaint,loud,new Uint8Array(1024).fill(128),2,0,'#abcdef',true);assert.equal(redLines.length,0,'FFT saturation is not an audio waveform clipping measurement');
console.log('PASS: optional red saturation tips, mirrored tips, Orbit tips and no false waveform clipping claim.');
