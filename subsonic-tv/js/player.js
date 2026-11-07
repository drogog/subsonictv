var MusicPlayer = (function () {
  'use strict';
  var audio = document.getElementById('audio');
  var queue = [], index = -1, state = 'Stopped', notify = function () {};
  var fadeTimer = null, pendingPause = false;
  var sessionReady = false, revision = 0, unloaded = false, level = 1, levelLabel = '', gainRequest = null;
  var playbackRevision = 0, mixLabel = '';
  var format = '', formatRequest = null, bindings = [];
  var context = null, analyser = null, source = null, bins = null, analysisMessage = 'Spectrum off', watchdog = null;
  var probeTimer = null, oscillator = null, mute = null, probePassed = false;
  /* Device tests on the target Tizen 2.4 TV: oscillator works, media bridge is silent. */
  var legacyBridge = typeof navigator !== 'undefined' && /Tizen 2\.4(?:\D|$)/i.test(navigator.userAgent || '');
  var bridgeFailed = false;
  var nativeFailed = false, htmlAudio = audio;
  function nativeAvailable() { return !nativeFailed && typeof NativeAudio !== 'undefined' && NativeAudio.available(); }
  function analysisAvailable() { if (typeof StreamAudio !== 'undefined') { return !!audio.streamAudio; } return !!audio.nativeAudio || nativeAvailable() || (!legacyBridge && !bridgeFailed); }
  function selectOutput(streaming) {
    var old = audio, i;
    if (old.close) { old.close(); } else { old.pause(); old.removeAttribute('src'); old.load(); }
    audio = streaming ? StreamAudio.create(queue[index]) : htmlAudio;
    if (streaming) { for (i = 0; i < bindings.length; i++) { bind(audio,bindings[i].name,bindings[i].callback); } }
  }
  function restoreStream() {
    var old = audio, url = old.src, at = old.currentTime || 0, playing = !old.paused, track = queue[index];
    cancelFade(); selectOutput(false); analysisMessage = 'Using TV playback · ' + (old.error && old.error.message || 'Visualization unavailable for this stream');
    if (at > 0) { var restore = function () { htmlAudio.removeEventListener('loadedmetadata',restore); if (audio === htmlAudio && queue[index] === track) { htmlAudio.currentTime = at; } }; htmlAudio.addEventListener('loadedmetadata',restore); }
    audio.src = url; audio.load(); inspectFormat(); if (playing) { play(); } else { state = 'Paused'; } update();
  }
  function restoreHTML(message) {
    var old = audio, url = old.src, at = old.currentTime || 0, playing = !old.paused, track = queue[index], element = htmlAudio;
    cancelFade(); old.close(); nativeFailed = true; audio = htmlAudio;
    analysisMessage = message;
    if (at > 0) { var restore = function () { element.removeEventListener('loadedmetadata',restore); if (audio === element && queue[index] === track) { try { element.currentTime = at; } catch (error) {} } }; element.addEventListener('loadedmetadata',restore); }
    audio.src = url; audio.load(); if (playing) { play(); } else { state = 'Paused'; } update();
  }
  function enableNative() {
    var plain = audio, candidate = NativeAudio.create(), i;
    try { candidate.prime(plain.getAttribute('src'),plain.currentTime || 0); }
    catch (error) { candidate.close(); nativeFailed = true; analysisMessage = 'Native hook unavailable (' + (error.name || 'Error') + '); playback unchanged'; update(); return; }
    var playing = !plain.paused;
    cancelFade(); htmlAudio = plain; audio = candidate;
    for (i = 0; i < bindings.length; i++) { bind(candidate,bindings[i].name,bindings[i].callback); }
    plain.pause(); plain.removeAttribute('src'); plain.load();
    state = 'Loading'; if (playing) { candidate.play(); }
    candidate.prepare(); update();
  }
  function on(name, callback) {
    bindings.push({name:name, callback:callback}); bind(audio,name,callback);
  }
  function bind(element,name,callback) { element.addEventListener(name,function () { if (audio === element) { callback(); } }); }
  function releaseGraph() {
    stopProbe();
    if (watchdog !== null) { clearInterval(watchdog); watchdog = null; }
    try { if (source) { source.disconnect(); } if (analyser) { analyser.disconnect(); } if (context && context.close) { var closed = context.close(); if (closed && closed.catch) { closed.catch(function () {}); } } } catch (error) {}
    source = null; analyser = null; context = null; bins = null;
  }
  function stopProbe() {
    if (probeTimer !== null) { clearInterval(probeTimer); probeTimer = null; }
    try { if (oscillator) { if (oscillator.stop) { oscillator.stop(0); } else if (oscillator.noteOff) { oscillator.noteOff(0); } oscillator.disconnect(); } } catch (error) {}
    try { if (mute) { mute.disconnect(); } } catch (error) {}
    oscillator = null; mute = null;
  }
  function replaceAudio(at, playing, overrideUrl) {
    var old = audio, url = arguments.length > 2 ? overrideUrl : old.getAttribute('src'), i;
    cancelFade(); audio = document.createElement('audio'); audio.id = 'audio'; audio.preload = 'none';
    old.parentNode.replaceChild(audio,old);
    for (i = 0; i < bindings.length; i++) { bind(audio,bindings[i].name,bindings[i].callback); }
    old.pause(); old.removeAttribute('src'); old.load();
    if (at > 0) { (function (element) { var restore = function () { element.removeEventListener('loadedmetadata',restore); if (audio === element) { try { element.currentTime = at; } catch (error) {} } }; element.addEventListener('loadedmetadata',restore); }(audio)); }
    if (url) { audio.src = url; audio.load(); }
    if (playing) { play(); }
  }
  function disableAnalysis(message) {
    if (typeof StreamAudio !== 'undefined') { return; }
    if (audio.nativeAudio) { return; } /* Keep native playback running when leaving the visualizer. */
    var attached = !!source, at = audio.currentTime || 0, playing = !audio.paused || state === 'Playing' || state === 'Buffering' || state === 'Loading';
    releaseGraph(); analysisMessage = message || 'Spectrum off';
    if (attached) { replaceAudio(at,playing); } update();
  }
  function enableAnalysis() {
    if (typeof StreamAudio !== 'undefined') { return; }
    var Constructor = window.AudioContext || window.webkitAudioContext, attempts = 0;
    if (audio.nativeAudio) { return; }
    if (nativeAvailable() && queue[index] && !queue[index].radio) { enableNative(); return; }
    if (!analysisAvailable()) { if (!nativeFailed) { analysisMessage = legacyBridge ? 'Native analysis API unavailable on this firmware; playback unchanged' : 'Live spectrum unavailable: playback samples cannot be read.'; } update(); return; }
    if (analyser) { return; }
    if (!queue[index] || queue[index].radio) { analysisMessage = 'Spectrum is available for library tracks'; update(); return; }
    if (!Constructor) { analysisMessage = 'Web Audio is unavailable on this TV'; update(); return; }
    try {
      context = new Constructor();
      if (!context.createMediaElementSource || !context.createAnalyser) { throw new Error('unsupported'); }
      analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8;
      bins = new Uint8Array(analyser.frequencyBinCount);
      if (context.resume) { var resumed = context.resume(); if (resumed && resumed.catch) { resumed.catch(function () {}); } }
      if (probePassed || !context.createOscillator || !(context.createGain || context.createGainNode)) { attachAnalysis(); return; }
      /* This signal stays behind zero gain and is never used as music data. */
      oscillator = context.createOscillator(); mute = (context.createGain || context.createGainNode).call(context);
      mute.gain.value = 0; oscillator.frequency.value = 440;
      oscillator.connect(analyser); analyser.connect(mute); mute.connect(context.destination);
      if (oscillator.start) { oscillator.start(0); } else { oscillator.noteOn(0); }
      analysisMessage = 'Checking analyser (muted)'; update();
      probeTimer = setInterval(function () {
        var i, peak = 0;
        try { analyser.getByteFrequencyData(bins); for (i = 0; i < bins.length; i++) { peak = Math.max(peak,bins[i]); } }
        catch (error) { releaseGraph(); analysisMessage = 'Analyser test failed; music unchanged'; update(); return; }
        attempts++;
        if (peak > 0) { probePassed = true; stopProbe(); analyser.disconnect(); attachAnalysis(); }
        else if (attempts >= 6) { releaseGraph(); analysisMessage = 'Analyser test: no samples; music unchanged'; update(); }
      },250);
    } catch (error) { releaseGraph(); analysisMessage = 'Audio analysis unavailable (' + (error.name || 'Error') + ')'; update(); }
  }
  function attachAnalysis() {
    var at = audio.currentTime || 0, playing = !audio.paused, url = audio.getAttribute('src'), silentSince = null, replaced = false;
    try {
      /* Build the graph on a fresh element before assigning any media URL. */
      replaceAudio(at,false,null); replaced = true;
      audio.crossOrigin = 'anonymous';
      source = context.createMediaElementSource(audio); source.connect(analyser); analyser.connect(context.destination);
      analysisMessage = (probePassed ? 'Analyser OK · ' : '') + 'Waiting for music samples';
      audio.src = url;
      audio.load(); if (playing) { play(); }
      if (!source) { return; }
      watchdog = setInterval(function () {
        var i, found = false, peak = 0;
        if (!analyser || audio.paused) { silentSince = null; return; }
        try { analyser.getByteFrequencyData(bins); for (i = 0; i < bins.length; i++) { peak = Math.max(peak,bins[i]); } found = peak > 0; }
        catch (error) { disableAnalysis('Audio analysis failed; normal playback restored'); return; }
        if (found) { silentSince = null; analysisMessage = 'Live spectrum · peak ' + peak; }
        else { analysisMessage = (probePassed ? 'Analyser OK · ' : '') + 'No music samples'; if (silentSince === null) { silentSince = Date.now(); } if (Date.now() - silentSince >= 8000) { bridgeFailed = true; disableAnalysis('Live spectrum unavailable: no music samples; normal playback restored'); } }
      },250);
      update();
    } catch (error) {
      releaseGraph();
      if (replaced) { replaceAudio(at,playing,url); }
      analysisMessage = 'Hook failed (' + (error.name || 'Error') + '); normal playback restored'; update();
    }
  }
  function inspectFormat() {
    var track = queue[index];
    if (formatRequest) { formatRequest.cancel(); formatRequest = null; }
    if (typeof AudioFormat === 'undefined') { return; }
    format = AudioFormat.describe(track,'',true);
    formatRequest = AudioFormat.inspect(track,audio.getAttribute('src'),function (value) { if (queue[index] === track) { format = value; update(); } });
  }
  function fadeDuration() { return audio.nativeAudio ? 0 : typeof AppSettings !== 'undefined' ? AppSettings.values.fade : 0; }
  function cancelFade() { if (fadeTimer !== null) { clearInterval(fadeTimer); fadeTimer = null; } pendingPause = false; }
  function volume(value) { try { audio.volume = value; } catch (error) { /* Some TV engines do not expose software gain. */ } }
  function fadeTo(target, complete) {
    var duration = fadeDuration(), from = typeof audio.volume === 'number' ? audio.volume : 1, started = Date.now();
    if (fadeTimer !== null) { clearInterval(fadeTimer); fadeTimer = null; }
    if (!duration) { volume(target); if (complete) { complete(); } return; }
    fadeTimer = setInterval(function () {
      var amount = Math.min(1, (Date.now() - started) / duration);
      volume(from + (target - from) * amount);
      if (amount === 1) { clearInterval(fadeTimer); fadeTimer = null; if (complete) { complete(); } }
    }, 50);
  }
  function status() { return { track: queue[index], index: index, count: queue.length,
    state: state, format:format, revision:revision, playbackRevision:playbackRevision, mixLabel:mixLabel, normalization:levelLabel, repeat:typeof AppSettings !== 'undefined' ? AppSettings.values.repeat || 0 : 0, time: audio.currentTime || 0, duration: queue[index] && queue[index].radio ? 0 : (isFinite(audio.duration) ? audio.duration : 0) }; }
  function update() { if (sessionReady && typeof Listening !== 'undefined') { Listening.save(queue,index,revision); } notify(status()); }
  function loadGain() {
    var selected = queue[index];
    if (typeof Listening === 'undefined' || !AppSettings.values.normalization || AppSettings.values.quality || !selected || selected.radio || selected.replayGain || selected.gainChecked || gainRequest) { return; }
    gainRequest = MusicAPI.request('getSong',{id:selected.id},function (error,data) { if (queue[index] !== selected) { return; } gainRequest = null; selected.gainChecked = true; if (!error && data.song && data.song.replayGain) { selected.replayGain = data.song.replayGain; revision++; refreshGain(); } });
  }
  function refreshGain() {
    var result = typeof Listening !== 'undefined' ? Listening.gain(queue[index]) : {value:1,label:''}; level = result.value; levelLabel = result.label;
    if (!pendingPause) { fadeTo(level); } update(); loadGain();
  }
  function play() {
    var result;
    if (unloaded) { unloaded = false; start(index); return; }
    var wasFading = pendingPause;
    cancelFade();
    try {
      if (queue[index] && queue[index].radio && !/^https?:\/\//i.test(queue[index].streamUrl || '')) { state = 'Station needs an HTTP or HTTPS stream URL'; update(); return; }
      if (queue[index] && queue[index].radio && !audio.getAttribute('src')) { audio.src = queue[index].streamUrl; audio.load(); }
      if (audio.paused && !wasFading) { volume(fadeDuration() ? 0 : level); }
      result = audio.play();
      if (wasFading && !audio.paused) { fadeTo(level); }
      if (result && result.catch) { result.catch(function () { state = 'Playback could not start'; update(); }); }
    } catch (error) { state = 'Playback could not start'; update(); }
  }
  function start(position) {
    var params;
    if (position < 0 || position >= queue.length) { return; }
    playbackRevision++;
    if (analyser && !source) { releaseGraph(); analysisMessage = 'Spectrum off'; }
    if (source) { releaseGraph(); replaceAudio(0,false,null); analysisMessage = 'Spectrum off — open fullscreen to enable for this track'; }
    cancelFade();
    unloaded = false; index = position; state = 'Loading';
    if (gainRequest) { gainRequest.cancel(); gainRequest = null; }
    var gainResult = typeof Listening !== 'undefined' ? Listening.gain(queue[index]) : {value:1,label:''}; level = gainResult.value; levelLabel = gainResult.label;
    loadGain();
    if (typeof StreamAudio !== 'undefined') {
      var track = queue[index], settings = typeof AppSettings !== 'undefined' ? AppSettings.values : {};
      selectOutput(!track.radio && !settings.quality && settings.engine !== 1 && StreamAudio.supports(track) && StreamAudio.available());
      analysisMessage = track.radio ? 'Radio visualization unavailable' : 'Visualization needs Original MP3 / FLAC / M4A playback';
      state = 'Loading';
    }
    if (formatRequest) { formatRequest.cancel(); formatRequest = null; }
    format = typeof AudioFormat !== 'undefined' ? AudioFormat.describe(queue[index],'',true) : '';
    if (queue[index].radio) {
      if (!/^https?:\/\//i.test(queue[index].streamUrl || '')) { audio.pause(); audio.removeAttribute('src'); audio.load(); state = 'Station needs an HTTP or HTTPS stream URL'; update(); return; }
      audio.src = queue[index].streamUrl; audio.load(); inspectFormat(); play(); update(); return;
    }
    params = { id: queue[index].id };
    if (typeof AppSettings === 'undefined' || !AppSettings.values.quality) { params.format = 'raw'; params.maxBitRate = 0; }
    else { params.maxBitRate = AppSettings.values.bitrate || 192; if (AppSettings.values.quality !== 2) { params.format = {1:'mp3',3:'aac',4:'opus'}[AppSettings.values.quality]; } else if (SUBSONIC_CONFIG.streamFormat) { params.format = SUBSONIC_CONFIG.streamFormat; } }
    audio.src = MusicAPI.url('stream', params); audio.load(); inspectFormat(); play(); update();
  }
  on('playing', function () { state = 'Playing'; if (!pendingPause) { fadeTo(level); } update(); });
  on('pause', function () { if (state !== 'Stopped') { state = 'Paused'; } update(); });
  on('waiting', function () { state = 'Buffering'; update(); });
  on('timeupdate', update);
  on('loadedmetadata', update);
  on('error', function () { if (audio.streamAudio) { restoreStream(); return; } if (audio.nativeAudio) { restoreHTML('Native playback failed; normal playback restored'); return; } if (source) { disableAnalysis('Stream cannot be analysed; normal playback restored'); return; } cancelFade(); volume(level); state = 'Audio error (code ' + (audio.error ? audio.error.code : '?') + ')'; update(); });
  on('ended', function () {
    cancelFade();
    if (queue[index] && queue[index].radio) { state = 'Station disconnected'; audio.removeAttribute('src'); audio.load(); update(); }
    else if (typeof AppSettings !== 'undefined' && AppSettings.values.repeat === 1) { start(index); }
    else if (index + 1 < queue.length) { start(index + 1); }
    else if (typeof AppSettings !== 'undefined' && AppSettings.values.repeat === 2 && queue.length) { start(0); }
    else { state = 'Finished'; update(); }
  });
  function finishPause() {
    pendingPause = false;
    audio.pause();
    if (queue[index] && queue[index].radio) { audio.removeAttribute('src'); audio.load(); state = 'Stopped'; update(); }
    volume(level);
  }
  function pause() {
    if (audio.paused || !queue.length) { cancelFade(); finishPause(); return; }
    if (pendingPause) { return; }
    pendingPause = true; fadeTo(0, finishPause);
  }
  return {
    status:status,
    refreshGain:refreshGain,
    refreshStatus:update,
    tracks:function () { return queue.slice(0); },
    replaceUpcoming:function (tracks, expected, label) {
      if (!expected || queue[index] !== expected.track || index !== expected.index || revision !== expected.revision || playbackRevision !== expected.playbackRevision || !queue[index] || queue[index].radio) { return false; }
      var seen = {}, next = [], i, t; seen['$' + queue[index].id] = true;
      for (i = 0; i < tracks.length && next.length < 50; i++) { t = tracks[i]; if (t && t.id && !t.radio && !t.isVideo && !seen['$' + t.id]) { seen['$' + t.id] = true; next.push(t); } }
      if (!next.length) { return false; }
      queue = queue.slice(0,index + 1).concat(next); mixLabel = label || ''; revision++; sessionReady = true; update(); return true;
    },
    jump:start,
    restore:function () { if (typeof Listening === 'undefined') { return false; } var saved = Listening.restore(); sessionReady = true; if (!saved) { return false; } queue = saved.tracks; index = saved.index; revision++; unloaded = true; state = 'Paused'; format = typeof AudioFormat !== 'undefined' ? AudioFormat.describe(queue[index],'',true) : ''; update(); return true; },
    enqueue:function (tracks,next) { sessionReady = true; var at = next ? index + 1 : queue.length; if (!tracks.length) { return; } queue = queue.slice(0,at).concat(tracks,queue.slice(at)); mixLabel = ''; revision++; if (index < 0) { index = 0; unloaded = true; state = 'Paused'; } update(); },
    move:function (from,to) { if (from < 0 || to < 0 || from >= queue.length || to >= queue.length || from === to) { return; } var current = index, moved = queue.splice(from,1)[0]; queue.splice(to,0,moved); if (current === from) { index = to; } else if (from < current && to >= current) { index--; } else if (from > current && to <= current) { index++; } mixLabel = ''; revision++; update(); },
    remove:function (at) { if (at < 0 || at >= queue.length) { return; } var current = at === index, playing = !audio.paused; queue.splice(at,1); mixLabel = ''; revision++; if (at < index) { index--; } if (current) { cancelFade(); if (gainRequest) { gainRequest.cancel(); gainRequest = null; } if (formatRequest) { formatRequest.cancel(); formatRequest = null; } selectOutput(false); index = Math.min(index,queue.length-1); unloaded = index >= 0; state = 'Paused'; format = ''; if (playing && index >= 0) { start(index); return; } } if (!queue.length) { index = -1; unloaded = false; state = 'Stopped'; } update(); },
    analysis:function (enabled) { if (enabled) { enableAnalysis(); } else { disableAnalysis(); } },
    spectrum:function () { if (audio.streamAudio || audio.nativeAudio) { return audio.spectrum(); } if (source && analyser) { try { analyser.getByteFrequencyData(bins); return bins; } catch (error) {} } return null; },
    waveform:function () { return audio.streamAudio ? audio.waveform() : null; },
    diagnostics:function () { return audio.streamAudio ? audio.diagnostics() : null; },
    analysisStatus:function () { return audio.streamAudio || audio.nativeAudio ? audio.analysisStatus() : analysisMessage; },
    analysisAvailable:analysisAvailable,
    listen: function (callback) { notify = callback; update(); },
    queue: function (tracks, position) { sessionReady = true; mixLabel = ''; queue = tracks.slice(0); revision++; start(position); },
    radio: function (stations, position) {
      var tracks = [], i;
      for (i = 0; i < stations.length; i++) { tracks.push({id:'radio:' + stations[i].id, title:stations[i].name, artist:'Internet radio', radio:true, streamUrl:stations[i].streamUrl}); }
      sessionReady = true; mixLabel = ''; queue = tracks; revision++; start(position);
    },
    toggle: function () { if (!queue.length) { return; } if (audio.paused || pendingPause) { play(); } else { pause(); } },
    play: function () { if (queue.length) { play(); } },
    pause: pause,
    stop: function () { playbackRevision++; cancelFade(); finishPause(); state = 'Stopped'; update(); },
    next: function () { start(index + 1 < queue.length ? index + 1 : typeof AppSettings !== 'undefined' && AppSettings.values.repeat === 2 ? 0 : index + 1); },
    previous: function () { if (!(queue[index] && queue[index].radio) && audio.currentTime > 3) { playbackRevision++; audio.currentTime = 0; update(); } else { start(index - 1); } }
  };
}());
