/* Bounded canvas geometry and a fixed history; no accumulating translucent framebuffer. */
var MusicVisualizer = (function () {
  'use strict';
  var levels = new Float32Array(48), saturated = new Float32Array(48), starts = [], ends = [], sine = [], cosine = [], size = 0, frame = 0, i;
  var history = [], waves = [], energies = new Float32Array(13), hasWave = [];
  for (i = 0; i < 48; i++) { sine[i] = Math.sin(i * Math.PI * 2 / 48); cosine[i] = Math.cos(i * Math.PI * 2 / 48); }
  for (i = 0; i < 13; i++) { history.push(new Float32Array(48)); waves.push(new Uint8Array(160)); }
  function reset() { frame = 0; for (var j = 0; j < 48; j++) { levels[j] = 0; saturated[j] = 0; } }
  function paint(context,levels,wave,style,effect,colour,showSaturation,energy,alpha) {
    var j, k, x, y, height, radius, outer;
    context.globalAlpha = alpha; context.fillStyle = colour; context.strokeStyle = colour; context.lineWidth = 2;
    if (style === 2 && wave) {
      context.beginPath();
      for (j = 0; j < 160; j++) { x = 20 + j * 600 / 159; y = 210 + (wave[j] - 128) / 128 * 65; if (j) { context.lineTo(x,y); } else { context.moveTo(x,y); } }
      context.stroke();
    } else if (style === 3) {
      radius = 28 + (effect === 2 ? energy * 10 : 0); context.beginPath();
      for (j = 0; j < 48; j++) { outer = radius + 3 + levels[j] * 48; context.moveTo(320 + cosine[j] * radius,200 + sine[j] * radius); context.lineTo(320 + cosine[j] * outer,200 + sine[j] * outer); }
      context.stroke(); context.beginPath(); context.arc(320,200,radius - 5,0,Math.PI * 2); context.stroke();
      if (showSaturation) { context.strokeStyle = '#ff625f'; context.globalAlpha = 1; context.beginPath(); for (j = 0; j < 48; j++) { if (saturated[j]) { outer = radius + 3 + levels[j] * 48; context.moveTo(320 + cosine[j] * (outer - 4),200 + sine[j] * (outer - 4)); context.lineTo(320 + cosine[j] * outer,200 + sine[j] * outer); } } context.stroke(); }
    } else if (style === 4) {
      // Mirrored spectrum ribbon, 96 line segments.
      for (k = -1; k <= 1; k += 2) {
        context.beginPath();
        for (j = 0; j < 48; j++) { x = 12 + j * 616 / 47; y = 210 + k * levels[j] * 80; if (j) { context.lineTo(x,y); } else { context.moveTo(x,y); } }
        context.stroke();
      }
    } else if (style === 5) {
      for (k = 0; k < 2; k++) {
        context.beginPath();
        for (j = 0; j <= 48; j++) { var band = j % 48; radius = 34 + k * 14 + (levels[(band + 47) % 48] + levels[band] * 2 + levels[(band + 1) % 48]) / 4 * (k ? 28 : 42); x = 320 + cosine[band] * radius; y = 200 + sine[band] * radius; if (j) { context.lineTo(x,y); } else { context.moveTo(x,y); } }
        context.stroke();
      }
    } else if (style === 6) {
      for (j = 0; j < 24; j++) { height = Math.ceil(Math.max(levels[j * 2],levels[j * 2 + 1]) * 6); for (k = 0; k < height; k++) { context.fillRect(18 + j * 25,270 - k * 20,14,12); } }
    } else {
      for (j = 0; j < 48; j++) { height = Math.max(0,levels[j] * (style === 1 ? 62 : 140)); x = 12 + j * 616 / 48; context.fillRect(x,style === 1 ? 210 - height : 280 - height,9,style === 1 ? height * 2 : height); }
      if (showSaturation) { context.fillStyle = '#ff625f'; context.globalAlpha = 1; for (j = 0; j < 48; j++) { if (saturated[j]) { height = Math.max(0,levels[j] * (style === 1 ? 62 : 140)); x = 12 + j * 616 / 48; context.fillRect(x,style === 1 ? 210 - height : 280 - height,9,Math.min(3,height)); if (style === 1) { context.fillRect(x,210 + height - Math.min(3,height),9,Math.min(3,height)); } } } }
    }
  }
  function draw(context,data,wave,style,effect,colour,showSaturation) {
    var j, k, sum, peak, value, energy = 0, slot = frame % 13, previous, age;
    // An opaque clear each frame prevents low-bit-depth alpha rounding residue.
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1; context.fillStyle = '#08080b'; context.fillRect(0,0,640,360);
    if (!data || !data.length) { return; }
    if (size !== data.length) {
      size = data.length;
      for (j = 0; j < 48; j++) { starts[j] = Math.min(size - 1,Math.floor(Math.pow(size,j / 48))); ends[j] = Math.min(size,Math.max(starts[j] + 1,Math.floor(Math.pow(size,(j + 1) / 48)))); }
    }
    for (j = 0; j < 48; j++) {
      sum = 0; peak = 0;
      for (k = starts[j]; k < ends[j]; k++) { sum += data[k]; peak = Math.max(peak,data[k]); }
      value = sum / (ends[j] - starts[j]) / 255; saturated[j] = peak === 255 ? 1 : 0;
      levels[j] = Math.max(value,levels[j] * 0.88); if (levels[j] < 0.003) { levels[j] = 0; }
      history[slot][j] = levels[j]; if (j < 12) { energy += value / 12; }
    }
    hasWave[slot] = !!(wave && wave.length); energies[slot] = energy;
    if (hasWave[slot]) { for (j = 0; j < 160; j++) { waves[slot][j] = wave[Math.floor(j * wave.length / 160)]; } }
    if (effect === 3) { colour = 'hsl(' + (frame % 1440 / 4) + ',75%,70%)'; }
    if (effect === 4) { context.save(); context.translate(320,200); context.scale(0.9 + energy * 0.1,0.9 + energy * 0.1); context.translate(-320,-200); }
    if (effect === 1) {
      for (age = 12; age >= 4; age -= 4) {
        if (frame < age) { continue; }
        previous = (slot + 13 - age) % 13;
        paint(context,history[previous],hasWave[previous] ? waves[previous] : null,style,0,colour,false,energies[previous],(16 - age) / 50);
      }
    }
    paint(context,levels,hasWave[slot] ? waves[slot] : null,style,effect,colour,showSaturation,energy,effect === 2 ? 0.45 + energy * 0.55 : 1);
    if (effect === 4) { context.restore(); }
    context.globalAlpha = 1; frame++;
  }
  return {draw:draw,reset:reset};
}());
