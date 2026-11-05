/* Samsung's native playback spectrum; no secondary stream or audio download. */
var NativeAudio = (function () {
  'use strict';
  function api() { try { return typeof webapis !== 'undefined' ? webapis.avplay : null; } catch (error) { return null; } }
  function available() { var av = api(); return !!(av && av.open && av.prepareAsync && av.setSoundAnalysisListener); }
  function create() {
    var av = api(), events = {}, generation = 0, ready = false, wantsPlay = false, position = 0, duration = 0;
    var timeout = null, spectrum = null, receivedAt = 0, startedAt = 0, message = 'Native spectrum: waiting', analysisError = '';
    var player = {nativeAudio:true, src:'', paused:true, volume:1, error:null};
    function emit(name) { var list = (events[name] || []).slice(0), i; for (i = 0; i < list.length; i++) { list[i](); } }
    function clearTimer() { if (timeout !== null) { clearTimeout(timeout); timeout = null; } }
    function fail(error) { clearTimer(); player.error = {code:error && error.name || 'NativePlaybackError'}; emit('error'); }
    function close() {
      generation++; clearTimer(); ready = false; wantsPlay = false; player.paused = true; spectrum = null;
      try { av.unsetSoundAnalysisListener(); } catch (error) {}
      try { var state = av.getState(); if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') { av.stop(); } } catch (error) {}
      try { av.close(); } catch (error) {}
    }
    function prime(url, at) {
      close(); player.src = url; position = at || 0; duration = 0; analysisError = ''; receivedAt = 0; startedAt = 0;
      message = 'Native spectrum: waiting for bands';
      var token = generation;
      av.open(url);
      av.setListener({
        oncurrentplaytime:function (ms) { if (token !== generation) { return; } position = ms / 1000; emit('timeupdate'); },
        onbufferingstart:function () { if (token === generation) { emit('waiting'); } },
        onbufferingcomplete:function () { if (token === generation && ready && wantsPlay) { emit('playing'); } },
        onstreamcompleted:function () { if (token === generation) { player.paused = true; wantsPlay = false; emit('ended'); } },
        onerror:function () { if (token === generation) { fail({name:'NativePlaybackError'}); } }
      });
      function bands(values) {
        var i, value, peak = 0;
        if (token !== generation || !values || !values.length) { return; }
        if (!spectrum || spectrum.length !== Math.min(48,values.length)) { spectrum = new Uint8Array(Math.min(48,values.length)); }
        for (i = 0; i < spectrum.length; i++) {
          value = Number(values[i]); value = isFinite(value) ? Math.abs(value) : 0;
          peak = Math.max(peak,value); spectrum[i] = Math.round(Math.min(1,value / 70) * 255);
        }
        receivedAt = Date.now(); message = 'Native spectrum · ' + spectrum.length + ' bands · peak ' + Math.round(peak);
      }
      function analysisFailure(error) {
        if (token !== generation) { return; }
        analysisError = error && error.name || 'NotSupportedError'; spectrum = null;
        message = 'Native analysis unavailable (' + analysisError + ')';
      }
      /* Samsung documents both a function example and a callback interface. */
      bands.ongetbandsarray = bands; bands.ongetexception = analysisFailure; bands.onsetexception = analysisFailure;
      try { av.setSoundAnalysisListener(bands); }
      catch (error) {
        if (error.name !== 'TypeMismatchError') { throw error; }
        av.setSoundAnalysisListener({ongetbandsarray:bands,ongetexception:analysisFailure,onsetexception:analysisFailure});
      }
      if (analysisError) { var unsupported = new Error('Native analysis rejected'); unsupported.name = analysisError; throw unsupported; }
    }
    function playReady() {
      if (!ready || !wantsPlay) { return; }
      try { av.play(); player.paused = false; if (!startedAt) { startedAt = Date.now(); } emit('playing'); }
      catch (error) { fail(error); }
    }
    function prepare() {
      var token = generation;
      timeout = setTimeout(function () { if (token === generation) { fail({name:'NativePrepareTimeout'}); } },15000);
      emit('waiting');
      try {
        av.prepareAsync(function () {
          if (token !== generation) { return; }
          try { duration = av.getDuration() / 1000; } catch (error) { duration = 0; }
          function finish() {
            if (token !== generation) { return; }
            clearTimer(); ready = true; emit('loadedmetadata');
            if (token === generation) { playReady(); }
          }
          if (position > 0) {
            try { av.seekTo(Math.round(position * 1000),finish,function () { if (token === generation) { fail({name:'NativeSeekError'}); } }); }
            catch (error) { fail(error); }
          } else { finish(); }
        },function (error) { if (token === generation) { fail(error); } });
      } catch (error) { fail(error); }
    }
    player.addEventListener = function (name, callback) { (events[name] || (events[name] = [])).push(callback); };
    player.removeEventListener = function (name, callback) { var list = events[name] || [], i = list.indexOf(callback); if (i >= 0) { list.splice(i,1); } };
    player.getAttribute = function (name) { return player[name]; };
    player.removeAttribute = function (name) { if (name === 'src') { player.src = ''; } };
    player.load = function () {
      if (!player.src) { close(); position = 0; duration = 0; return; }
      try { prime(player.src,0); prepare(); } catch (error) { fail(error); }
    };
    player.play = function () { wantsPlay = true; player.paused = false; playReady(); };
    player.pause = function () {
      wantsPlay = false; player.paused = true;
      try { if (ready && av.getState() === 'PLAYING') { av.pause(); } } catch (error) { fail(error); return; }
      emit('pause');
    };
    player.prime = prime; player.prepare = prepare; player.close = close;
    player.spectrum = function () { return !analysisError && !player.paused && receivedAt && Date.now() - receivedAt < 1500 ? spectrum : null; };
    player.analysisStatus = function () {
      if (!analysisError && startedAt && Date.now() - (receivedAt || startedAt) > 5000 && !player.paused) { return 'No native spectrum data · no band callbacks · audio continues'; }
      return message;
    };
    Object.defineProperty(player,'currentTime',{get:function () { return position; },set:function (seconds) {
      var token = generation;
      if (!ready) { position = seconds; return; }
      try { av.seekTo(Math.round(seconds * 1000),function () { if (token === generation) { position = seconds; emit('timeupdate'); } },function () { if (token === generation) { fail({name:'NativeSeekError'}); } }); }
      catch (error) { fail(error); }
    }});
    Object.defineProperty(player,'duration',{get:function () { return duration; }});
    return player;
  }
  return {available:available,create:create};
}());
