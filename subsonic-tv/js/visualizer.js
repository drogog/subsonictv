/* Fixed-size canvas geometry; no DOM changes or allocations per rendered frame. */
var MusicVisualizer = (function () {
  'use strict';
  var levels = new Float32Array(48), saturated = new Float32Array(48), starts = [], ends = [], sine = [], cosine = [], size = 0, i;
  for (i = 0; i < 48; i++) { sine[i] = Math.sin(i * Math.PI * 2 / 48); cosine[i] = Math.cos(i * Math.PI * 2 / 48); }
  function reset() { for (var j = 0; j < 48; j++) { levels[j] = 0; saturated[j] = 0; } }
  function draw(context,data,wave,style,effect,colour,showSaturation) {
    var j, k, sum, peak, energy = 0, value, x, y, height, radius, outer;
    if (size !== data.length) {
      size = data.length;
      for (j = 0; j < 48; j++) { starts[j] = Math.min(size - 1,Math.floor(Math.pow(size,j / 48))); ends[j] = Math.min(size,Math.max(starts[j] + 1,Math.floor(Math.pow(size,(j + 1) / 48)))); }
    }
    for (j = 0; j < 48; j++) {
      sum = 0; peak = 0; for (k = starts[j]; k < ends[j]; k++) { sum += data[k]; peak = Math.max(peak,data[k]); }
      value = sum / (ends[j] - starts[j]) / 255;
      saturated[j] = peak === 255 ? 1 : 0;
      levels[j] = Math.max(value,levels[j] * 0.88); if (j < 12) { energy += value / 12; }
    }
    context.globalAlpha = effect === 1 ? 0.24 : 1; context.fillStyle = '#08080b'; context.fillRect(0,0,640,360);
    context.globalAlpha = effect === 2 ? 0.45 + energy * 0.55 : 1; context.fillStyle = colour; context.strokeStyle = colour; context.lineWidth = 2;
    if (style === 2 && wave) {
      context.beginPath();
      for (j = 0; j < 160; j++) { x = 20 + j * 600 / 159; y = 210 + (wave[Math.floor(j * wave.length / 160)] - 128) / 128 * 65; if (j) { context.lineTo(x,y); } else { context.moveTo(x,y); } }
      context.stroke();
    } else if (style === 3) {
      radius = 28 + (effect === 2 ? energy * 10 : 0); context.beginPath();
      for (j = 0; j < 48; j++) { outer = radius + 3 + levels[j] * 48; context.moveTo(320 + cosine[j] * radius,200 + sine[j] * radius); context.lineTo(320 + cosine[j] * outer,200 + sine[j] * outer); }
      context.stroke(); context.beginPath(); context.arc(320,200,radius - 5,0,Math.PI * 2); context.stroke();
      if (showSaturation) { context.strokeStyle = '#ff625f'; context.globalAlpha = 1; context.beginPath(); for (j = 0; j < 48; j++) { if (saturated[j]) { outer = radius + 3 + levels[j] * 48; context.moveTo(320 + cosine[j] * (outer - 4),200 + sine[j] * (outer - 4)); context.lineTo(320 + cosine[j] * outer,200 + sine[j] * outer); } } context.stroke(); }
    } else {
      for (j = 0; j < 48; j++) { height = Math.max(1,levels[j] * (style === 1 ? 62 : 140)); x = 12 + j * 616 / 48; context.fillRect(x,style === 1 ? 210 - height : 280 - height,9,style === 1 ? height * 2 : height); }
      if (showSaturation) { context.fillStyle = '#ff625f'; context.globalAlpha = 1; for (j = 0; j < 48; j++) { if (saturated[j]) { height = Math.max(1,levels[j] * (style === 1 ? 62 : 140)); x = 12 + j * 616 / 48; context.fillRect(x,style === 1 ? 210 - height : 280 - height,9,Math.min(3,height)); if (style === 1) { context.fillRect(x,210 + height - Math.min(3,height),9,Math.min(3,height)); } } } }
    }
    context.globalAlpha = 1;
  }
  return {draw:draw,reset:reset};
}());
