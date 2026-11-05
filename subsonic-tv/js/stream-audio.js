/* Audio-element adapter for bounded PCM decoding; shares no parallel media stream. */
var StreamAudio = (function () {
  'use strict';
  function available() { return typeof StreamDecoder !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); }
  function create(track) {
    var events = {}, engine = null, generation = 0, position = 0, volume = 1, lastState = '';
    var player = {streamAudio:true,src:'',paused:true,duration:Number(track.duration) || 0,error:null};
    function emit(name) { var list = (events[name] || []).slice(0), i; for (i = 0; i < list.length; i++) { list[i](); } }
    function close() { generation++; if (engine) { engine.stop(); engine = null; } player.paused = true; lastState = ''; }
    function fail(message) { player.error = {code:'StreamDecodeError',message:message}; emit('error'); }
    player.addEventListener = function (name, callback) { (events[name] || (events[name] = [])).push(callback); };
    player.removeEventListener = function (name, callback) { var list = events[name] || [], i = list.indexOf(callback); if (i >= 0) { list.splice(i,1); } };
    player.getAttribute = function (name) { return player[name]; };
    player.removeAttribute = function (name) { if (name === 'src') { player.src = ''; } };
    player.load = function () { close(); position = 0; player.error = null; emit('loadedmetadata'); };
    player.play = function () {
      var token = generation, created;
      if (!player.paused) { return; }
      player.paused = false;
      try {
        StreamDecoder.unlock();
        if (engine) { engine.resume(); return; }
        emit('waiting');
        created = StreamDecoder.start(player.src,{
          volume:volume,
          onupdate:function (stat) {
            if (token !== generation) { return; }
            position = stat.playedSeconds;
            if (stat.state === 'Playing' && lastState !== 'Playing' && !player.paused) { lastState = stat.state; emit('playing'); }
            else { lastState = stat.state; }
            emit('timeupdate');
          },
          onend:function (stat) {
            if (token !== generation || stat.state === 'Stopped') { return; }
            position = stat.playedSeconds;
            if (stat.error) { fail(stat.error); }
            else { player.paused = true; engine = null; emit('ended'); }
          }
        });
        if (token === generation) { engine = created; } else { created.stop(); }
      } catch (error) { fail(error.name || 'Web Audio unavailable'); }
    };
    player.pause = function () { player.paused = true; if (engine) { engine.pause(); } emit('pause'); };
    player.close = close;
    player.spectrum = function () { return engine && !player.paused ? engine.spectrum() : null; };
    player.waveform = function () { return engine && !player.paused ? engine.waveform() : null; };
    player.analysisStatus = function () { return player.paused ? 'Paused' : engine ? 'Live audio' : 'Preparing audio'; };
    player.diagnostics = function () { return engine ? engine.stats() : null; };
    Object.defineProperty(player,'volume',{get:function () { return volume; },set:function (value) { volume = Math.max(0,Math.min(1,value)); if (engine) { engine.volume(volume); } }});
    Object.defineProperty(player,'currentTime',{get:function () { return engine ? engine.position() : position; },set:function (value) {
      // The TV UI only seeks to zero (Previous restarts the track).
      if (value !== 0) { return; }
      var playing = !player.paused; player.load(); if (playing) { player.play(); } emit('timeupdate');
    }});
    return player;
  }
  return {available:available,create:create};
}());
