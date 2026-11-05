var DecoderBench = (function () {
  'use strict';
  var active = false, engine = null, request = null, animation = null, generation = 0, index = 0, tracks = [], resume = false;
  var frameStart = 0, frames = 0, lastDraw = 0, fps = 0, results = [], canvas, paint, callback;
  var waitingStart = false;
  var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
  var caf = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.webkitCancelRequestAnimationFrame;
  function $(id) { return document.getElementById(id); }
  function stopDrawing() { if (animation !== null) { if (raf && caf) { caf.call(window,animation); } else { clearTimeout(animation); } animation = null; } }
  function draw() {
    var data, now = Date.now(), i, first, last, sum, j;
    if (!active || !engine) { animation = null; return; }
    if (now - lastDraw >= 16.67) {
      lastDraw = now - ((now - lastDraw) % 16.67); data = engine.spectrum();
      if (paint) {
        paint.clearRect(0,0,960,260); paint.fillStyle = AppSettings.palette[AppSettings.values.accent];
        if (data) { for (i = 0; i < 48; i++) { first = Math.floor(Math.pow(data.length,i / 48)); last = Math.max(first + 1,Math.floor(Math.pow(data.length,(i + 1) / 48))); sum = 0; for (j = first; j < last; j++) { sum += data[j]; } var height = sum / (last - first) / 255 * 230; paint.fillRect(i * 20,250 - height,15,height); } }
      }
      frames++;
    }
    if (now - frameStart >= 1000) { fps = Math.round(frames * 1000 / (now - frameStart)); frames = 0; frameStart = now; }
    animation = raf ? raf.call(window,draw) : setTimeout(draw,16);
  }
  function describe(stat) {
    var percent = stat.decodedSeconds ? stat.decodeMs / (stat.decodedSeconds * 10) : 0;
    return stat.state + ' · ' + stat.playedSeconds.toFixed(1) + ' s · draw ' + fps + ' FPS\n' +
      'Decode/schedule cost: ' + percent.toFixed(1) + '% of audio time · longest slice: ' + stat.maxSliceMs.toFixed(1) + ' ms\n' +
      'Underruns: ' + stat.underruns + ' · spectrum peak: ' + stat.peak + ' · retained audio buffers: ' + (stat.maxRetainedBytes / 1048576).toFixed(2) + ' MB\n' +
      'Received: ' + (stat.downloadedBytes / 1048576).toFixed(2) + ' MB in ' + stat.requests + ' range requests' + (stat.error ? '\n' + stat.error : '');
  }
  function run() {
    var token = generation, track = tracks[index];
    if (!active) { return; }
    if (!track) {
      engine = null; stopDrawing(); $('decoder-heading').textContent = 'Decoder test complete';
      $('decoder-metrics').textContent = results.map(function (r) { return r.codec.toUpperCase() + ': ' + (r.error || (r.decodePercent.toFixed(1) + '% decode cost · ' + r.fps + ' FPS · ' + r.underruns + ' underruns · peak ' + r.peak)); }).join('\n');
      if (callback) { callback(results); } return;
    }
    $('decoder-heading').textContent = 'Streaming ' + track.suffix.toUpperCase() + ' · 30-second test';
    $('decoder-song').textContent = track.title || 'Library sample';
    frames = 0; fps = 0; frameStart = Date.now(); lastDraw = 0;
    engine = StreamDecoder.start(MusicAPI.url('stream',{id:track.id,format:'raw',maxBitRate:0}),{
      seconds:30,
      onupdate:function (stat) { if (active && token === generation) { $('decoder-metrics').textContent = describe(stat); if (typeof ScreenAwake !== 'undefined') { ScreenAwake.update(stat); } } },
      onend:function (stat) {
        if (!active || token !== generation) { return; }
        results.push({codec:track.suffix,playedSeconds:stat.playedSeconds,decodePercent:stat.decodedSeconds ? stat.decodeMs / (stat.decodedSeconds * 10) : 0,maxSliceMs:stat.maxSliceMs,underruns:stat.underruns,peak:stat.peak,fps:fps,maxRetainedBytes:stat.maxRetainedBytes,downloadedBytes:stat.downloadedBytes,requests:stat.requests,startupMs:stat.startupMs,error:stat.error});
        stopDrawing(); engine = null; index++;
        setTimeout(function () { if (active && token === generation) { run(); } },500);
      }
    });
    draw();
  }
  function close() {
    active = false; waitingStart = false; generation++; if (request) { request.cancel(); request = null; } if (engine) { engine.stop(); engine = null; } stopDrawing();
    $('decoder-bench').className = 'hidden'; if (resume) { MusicPlayer.play(); } resume = false; if (typeof ScreenAwake !== 'undefined') { ScreenAwake.update(MusicPlayer.status()); }
  }
  function open(oncomplete) {
    if (active) { return; }
    active = true; generation++; callback = typeof oncomplete === 'function' ? oncomplete : null; results = []; tracks = []; index = 0;
    resume = MusicPlayer.status && /Playing|Buffering|Loading/.test(MusicPlayer.status().state); MusicPlayer.stop();
    $('decoder-bench').className = 'decoder-bench'; $('decoder-heading').textContent = 'Finding MP3 and FLAC samples…'; $('decoder-metrics').textContent = 'Original files · 64 KB requests · about 3 seconds buffered ahead'; $('decoder-song').textContent = '';
    canvas = $('decoder-canvas'); paint = canvas.getContext('2d'); var token = generation;
    request = MusicAPI.request('getRandomSongs',{size:200},function (error,data) {
      if (!active || token !== generation) { return; } request = null;
      if (error) { $('decoder-heading').textContent = 'Cannot load test samples'; $('decoder-metrics').textContent = error; return; }
      var songs = data.randomSongs && data.randomSongs.song || [], formats = ['mp3','flac'], i, j;
      for (i = 0; i < formats.length; i++) { for (j = 0; j < songs.length; j++) { if (songs[j].suffix === formats[i] && songs[j].duration >= 35) { tracks.push(songs[j]); break; } } }
      if (!tracks.length) { $('decoder-heading').textContent = 'No suitable MP3 or FLAC sample found'; return; }
      waitingStart = true; $('decoder-heading').textContent = 'Press OK to start the decoder test'; $('decoder-metrics').textContent = 'The remote key enables Web Audio output.\nStreams original MP3 / FLAC in small ranges.\nBack cancels and returns to your music.';
    });
  }
  return {open:open,close:close,snapshot:function () { return {active:active,waitingStart:waitingStart,index:index,results:results,metrics:engine ? engine.stats() : null}; },isOpen:function () { return active; },handle:function (event) { if (!active) { return false; } if ([10009,27,8,413].indexOf(event.keyCode) >= 0) { close(); } else if (event.keyCode === 13 && waitingStart) { waitingStart = false; try { StreamDecoder.unlock(); run(); } catch (error) { $('decoder-metrics').textContent = 'Web Audio could not start: ' + error.name; } } return true; }};
}());
