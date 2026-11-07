var ArtworkView = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var active = false, latest = null, timer = null, context = null, frame = 0, coverId = null, mode = 0;
  var animation = null, frames = 0, measuredAt = 0, pendingAnalysis = false, analysisLabel = '';
  var lastDraw = 0;
  var requestFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
  var cancelFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.webkitCancelRequestAnimationFrame;
  function stop() { if (typeof TurntableView !== 'undefined') { TurntableView.suspend(); } if (timer !== null) { clearInterval(timer); timer = null; } if (animation !== null) { if (requestFrame && cancelFrame) { cancelFrame.call(window,animation); } else { clearTimeout(animation); } animation = null; } }
  function spectrumFrame() {
    var data, now, wave;
    if (!active || mode !== 2 || document.hidden || !latest || latest.state !== 'Playing') { animation = null; return; }
    now = Date.now();
    if (now - lastDraw >= 16.67) {
      lastDraw = now - ((now - lastDraw) % 16.67); data = MusicPlayer.spectrum();
      if (!data) { $('artwork-mode').textContent = MusicPlayer.analysisStatus(); animation = null; return; }
      wave = AppSettings.values.visualizer === 2 && MusicPlayer.waveform ? MusicPlayer.waveform() : null;
      MusicVisualizer.draw(context,data,wave,AppSettings.values.visualizer || 0,AppSettings.values.effect || 0,AppSettings.palette[AppSettings.values.accent],AppSettings.values.saturation === 1); frames++;
    }
    if (now - measuredAt >= 1000) { $('artwork-mode').textContent = AppSettings.visualizerNames[AppSettings.values.visualizer] + (AppSettings.values.effect ? ' · ' + AppSettings.effectNames[AppSettings.values.effect] : ''); measuredAt = now; frames = 0; }
    animation = requestFrame ? requestFrame.call(window,spectrumFrame) : setTimeout(spectrumFrame,16);
  }
  function paint() {
    var x, y, i, height;
    if (!context) { return; }
    context.clearRect(0,0,640,360); context.fillStyle = AppSettings.palette[AppSettings.values.accent];
    for (i = 0; i < 24; i++) {
      height = 30 + 120 * (0.5 + 0.5 * Math.sin(frame / 22 + i * 0.48));
      x = i * 27; y = 180 - height / 2;
      context.globalAlpha = 0.07 + 0.09 * (0.5 + 0.5 * Math.sin(frame / 35 + i)); context.fillRect(x,y,19,height);
    }
    context.globalAlpha = 1; frame++;
  }
  function animate() {
    stop(); $('ambient-canvas').className = mode && mode !== 3 && (mode !== 2 || MusicPlayer.analysisAvailable()) ? '' : 'hidden';
    if (mode === 3) { TurntableView.open(latest); return; }
    if (typeof TurntableView !== 'undefined') { TurntableView.close(); }
    if (!mode) { return; }
    try { context = $('ambient-canvas').getContext('2d'); } catch (error) { context = null; }
    if (mode === 2) { if (context && MusicPlayer.analysisAvailable()) { context.clearRect(0,0,640,360); MusicVisualizer.reset(); frames = 0; lastDraw = 0; measuredAt = Date.now(); spectrumFrame(); } return; }
    paint();
    if (context && latest && latest.state === 'Playing' && !document.hidden) { timer = setInterval(paint, 100); }
  }
  function render() {
    var track = latest && latest.track, id = track && track.coverArt || '';
    $('artwork-title').textContent = track ? track.title || 'Untitled' : 'Choose a track to see its cover';
    $('artwork-artist').textContent = track ? track.artist || '' : '';
    $('artwork-view').className = 'artwork-view' + (mode === 3 ? ' vinyl' : mode === 2 && MusicPlayer.analysisAvailable() ? ' spectrum' : '');
    $('artwork-format').textContent = latest && latest.format || '';
    $('artwork-help').textContent = 'OK  Play / pause     ← →  Skip     ↑  View' + (mode === 2 ? '     ↓  Style     Yellow  Effect' : '') + '     Back';
    $('artwork-mode').textContent = mode === 3 ? '' : mode === 2 ? (MusicPlayer.analysisAvailable() ? AppSettings.visualizerNames[AppSettings.values.visualizer] : MusicPlayer.analysisStatus()) : mode ? 'Ambient' : '';
    if (id !== coverId || mode !== 3 && id && !$('artwork-image').src) {
      coverId = id; $('artwork-image').className = id ? '' : 'hidden';
      $('artwork-placeholder').className = id ? 'hidden' : '';
      $('artwork-image').onerror = function () { this.className = 'hidden'; $('artwork-placeholder').className = ''; };
      if (id && mode !== 3) { $('artwork-image').src = MusicAPI.url('getCoverArt', {id:id,size:600}); }
      else { $('artwork-image').removeAttribute('src'); }
    }
  }
  function close() { active = false; pendingAnalysis = false; stop(); if (typeof TurntableView !== 'undefined') { TurntableView.close(); } if (mode === 2) { MusicPlayer.analysis(false); } $('artwork-view').className = 'hidden'; $('artwork-image').removeAttribute('src'); coverId = null; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else if (active) { animate(); } });
  return {
    isOpen:function () { return active; },
    open:function () { active = true; mode = AppSettings.values.display; $('artwork-view').className = 'artwork-view'; render(); animate(); },
    update:function (state) {
      var changed = !latest || latest.state !== state.state, trackChanged = !latest || latest.track !== state.track, formatChanged = !latest || latest.format !== state.format;
      latest = state;
      if (active && mode === 3) { TurntableView.update(state); }
      if (active) {
        if (mode === 2 && trackChanged) { pendingAnalysis = MusicPlayer.analysisAvailable(); }
        if (mode === 2 && pendingAnalysis && state.state === 'Playing') { pendingAnalysis = false; MusicPlayer.analysis(true); }
        if (trackChanged || formatChanged) { render(); }
        if (mode === 2 && analysisLabel !== MusicPlayer.analysisStatus()) { analysisLabel = MusicPlayer.analysisStatus(); render(); if (animation === null || !MusicPlayer.analysisAvailable()) { changed = true; } }
        if (changed) { animate(); }
      }
    },
    handle:function (event) {
      var code = event.keyCode;
      if (!active) { return false; }
      if (code === 10009 || code === 27 || code === 8 || code === 406) { close(); }
      else if (code === 13 || code === 10252 || code === 32) { MusicPlayer.toggle(); }
      else if (code === 37 || code === 10232) { MusicPlayer.previous(); }
      else if (code === 39 || code === 10233) { MusicPlayer.next(); }
      else if (code === 38) { pendingAnalysis = false; mode = (mode + 1) % 4; if (mode === 2) { MusicPlayer.analysis(true); } else if (mode === 0) { MusicPlayer.analysis(false); } render(); animate(); }
      else if (mode === 2 && (code === 40 || code === 405)) { var name = code === 40 ? 'visualizer' : 'effect'; AppSettings.set(name,((AppSettings.values[name] || 0) + 1) % (code === 40 ? AppSettings.visualizerNames.length : AppSettings.effectNames.length)); render(); animate(); }
      else if (code === 415) { MusicPlayer.play(); } else if (code === 19) { MusicPlayer.pause(); } else if (code === 413) { MusicPlayer.stop(); }
      else if (code !== 40) { return false; }
      return true;
    }
  };
}());
