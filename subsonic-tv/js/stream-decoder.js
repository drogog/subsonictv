/* Experimental, bounded sequential decoding. Original files only; HTTP 206 is mandatory. */
var StreamDecoder = (function () {
  'use strict';
  var sharedContext = null, CHUNK = 65536, MAX_ENCODED = 1048576, AHEAD = 3, SENSITIVITIES = [-12,-6,0,6,12];
  function unlock() {
    if (!sharedContext) { sharedContext = new (window.AudioContext || window.webkitAudioContext)(); }
    if (sharedContext.resume) { sharedContext.resume(); }
    var silent = sharedContext.createBufferSource(); silent.buffer = sharedContext.createBuffer(1,1,22050); silent.connect(sharedContext.destination);
    if (silent.start) { silent.start(0); } else { silent.noteOn(0); }
    setTimeout(function () { try { silent.disconnect(); } catch (ignore) {} },100);
  }
  function clock() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }
  function start(url, options) {
    options = options || {};
    var context, analyser, gain, source, asset, format, xhr = null, timer = null, stopped = false, ended = false;
    var offset = 0, nodes = [], pending = [], pendingSeconds = 0, nextTime = 0, firstTime = null, startedWall = clock(), lastReport = 0, lastAudioTime = -1, lastAdvance = clock();
    var paused = false, positionBase = 0, awaitingSince = startedWall, spectrumSensitivity = null;
    function spectrumRange() {
      var value = typeof AppSettings !== 'undefined' ? AppSettings.values.sensitivity : 0;
      if (SENSITIVITIES.indexOf(value) < 0) { value = 0; }
      if (value === spectrumSensitivity) { return; }
      /* Set the range BEFORE byte conversion; post-scaling cannot recover clipped FFT bins. */
      analyser.minDecibels = -90 - value; analyser.maxDecibels = -12 - value;
      spectrumSensitivity = value;
    }
    var stat = {decodedSeconds:0,playedSeconds:0,decodeMs:0,maxSliceMs:0,downloadedBytes:0,retainedBytes:0,maxRetainedBytes:0,underruns:0,peak:0,startupMs:0,requests:0,sampleRate:0,channels:0,state:'Loading',error:''}, bins;
    function report() { if (options.onupdate) { options.onupdate(stat); } }
    function finish(reason) {
      var i;
      if (stopped) { return; } stopped = true;
      if (timer !== null) { clearTimeout(timer); } if (xhr) { xhr.onreadystatechange = null; xhr.abort(); xhr = null; }
      for (i = 0; i < nodes.length; i++) { try { if (nodes[i].node.stop) { nodes[i].node.stop(0); } else { nodes[i].node.noteOff(0); } nodes[i].node.disconnect(); } catch (ignore) {} }
      try { if (asset) { asset.stop(); asset.off(); if (asset.decoder) { asset.decoder.off(); } if (asset.demuxer) { asset.demuxer.off(); } } if (source) { source.off(); } if (gain) { gain.disconnect(); } if (analyser) { analyser.disconnect(); } } catch (ignore) {}
      nodes = []; pending = []; asset = null; source = null;
      stat.state = reason || 'Stopped'; report(); if (options.onend) { options.onend(stat); }
    }
    function fail(message) { stat.error = message; finish('Error'); }
    function trim(list) {
      var item, n = 0;
      if (!list) { return 0; }
      /* Keep two consumed buffers for frame rollback; never retain the whole file. */
      item = list.first || list.last;
      if (item && item.prev && item.prev.prev && item.prev.prev.prev) {
        /* The demuxer may retain its first chunk in an EOF closure. Break BOTH
           directions so that reference cannot keep every later chunk alive. */
        item.prev.prev.prev.next = null; item.prev.prev.prev = null;
      }
      item = list.last;
      while (item) { n += item.length; item = item.prev; }
      return n;
    }
    function retained() {
      var bytes = 0, i;
      if (asset && asset.demuxer) { bytes += trim(asset.demuxer.stream.list); }
      if (asset && asset.decoder) { bytes += trim(asset.decoder.stream.list); }
      if (bytes > MAX_ENCODED) { fail('Encoded buffer limit reached (large tags or unsupported stream).'); return 0; }
      for (i = 0; i < pending.length; i++) { bytes += pending[i].length * pending[i].numberOfChannels * 4; }
      for (i = 0; i < nodes.length; i++) { bytes += nodes[i].bytes; }
      stat.retainedBytes = bytes; stat.maxRetainedBytes = Math.max(stat.maxRetainedBytes,bytes); return bytes;
    }
    function buffered() { return pendingSeconds + Math.max(0,nextTime - context.currentTime); }
    function feed(data) {
      var t = clock();
      try { source.emit('data',new AV.Buffer(data)); } catch (error) { fail('Demux failed: ' + (error.name || 'Error')); }
      var elapsed = clock() - t; stat.decodeMs += elapsed; stat.maxSliceMs = Math.max(stat.maxSliceMs,elapsed);
    }
    function requestChunk() {
      var request, begin = offset;
      if (xhr || ended || stopped) { return; }
      request = new XMLHttpRequest(); xhr = request; stat.requests++;
      request.open('GET',url,true); request.responseType = 'arraybuffer'; request.timeout = 10000;
      request.setRequestHeader('Range','bytes=' + begin + '-' + (begin + CHUNK - 1));
      request.onreadystatechange = function () {
        var data, length;
        if (stopped || xhr !== request) { return; }
        if (request.readyState === 2 && request.status !== 206 && request.status !== 416) { fail('Server must support byte ranges; full response refused.'); return; }
        if (request.readyState !== 4) { return; }
        xhr = null;
        if (request.status === 416 && begin > 0) { ended = true; source.emit('end'); return; }
        if (request.status !== 206) { fail('Range request failed (' + request.status + ').'); return; }
        data = request.response; length = data && data.byteLength || 0;
        if (!length || length > CHUNK) { fail('Invalid range response size.'); return; }
        offset += length; stat.downloadedBytes += length;
        /* Skip ID3 tags without retaining or downloading embedded artwork. */
        if (begin === 0 && length >= 10) {
          var bytes = new Uint8Array(data), skip;
          if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
            skip = 10 + ((bytes[6] & 127) * 2097152 + (bytes[7] & 127) * 16384 + (bytes[8] & 127) * 128 + (bytes[9] & 127)) + ((bytes[5] & 16) ? 10 : 0);
            if (skip >= length) { offset = skip; return; }
            data = bytes.subarray(skip);
          }
        }
        feed(data);
        if (!stopped && length < CHUNK) { ended = true; source.emit('end'); }
      };
      request.onprogress = function (event) { if (event.loaded > CHUNK) { fail('Oversized range response refused.'); } };
      request.onerror = function () { if (!stopped && xhr === request) { fail('Network error while streaming.'); } };
      request.ontimeout = function () { if (!stopped && xhr === request) { fail('Stream request timed out.'); } };
      request.send();
    }
    function schedule() {
      var buffer, node, now = context.currentTime;
      while (nodes.length && nodes[0].end < now - 0.1) { try { nodes[0].node.disconnect(); } catch (ignore) {} nodes.shift(); }
      if (firstTime === null && pendingSeconds < 0.75 && !ended) { return; }
      while (pending.length) {
        if (nextTime < now) { if (firstTime !== null) { stat.underruns++; firstTime += now + 0.15 - nextTime; } nextTime = now + 0.15; }
        if (firstTime === null) { firstTime = nextTime; stat.startupMs = clock() - startedWall; stat.state = 'Playing'; }
        buffer = pending.shift(); pendingSeconds -= buffer.duration;
        node = context.createBufferSource(); node.buffer = buffer; node.connect(analyser);
        if (node.start) { node.start(nextTime); } else { node.noteOn(nextTime); }
        nodes.push({node:node,buffer:buffer,start:nextTime,end:nextTime + buffer.duration,bytes:buffer.length * buffer.numberOfChannels * 4}); nextTime += buffer.duration;
      }
      stat.playedSeconds = position();
    }
    function position() { return firstTime === null ? positionBase : Math.min(stat.decodedSeconds,positionBase + Math.max(0,Math.min(context.currentTime,nextTime) - firstTime)); }
    function pause() {
      var i, channel, item, skip, buffer, keep = [], now;
      if (stopped || paused) { return; }
      now = context.currentTime; positionBase = position(); paused = true;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      for (i = 0; i < nodes.length; i++) {
        item = nodes[i];
        try { if (item.node.stop) { item.node.stop(0); } else { item.node.noteOff(0); } item.node.disconnect(); } catch (ignore) {}
        if (item.end <= now) { continue; }
        skip = Math.max(0,Math.floor((now - item.start) * stat.sampleRate));
        if (!skip) { keep.push(item.buffer); }
        else if (skip < item.buffer.length) {
          buffer = context.createBuffer(stat.channels,item.buffer.length - skip,stat.sampleRate);
          for (channel = 0; channel < stat.channels; channel++) { buffer.getChannelData(channel).set(item.buffer.getChannelData(channel).subarray(skip)); }
          keep.push(buffer);
        }
      }
      pending = keep.concat(pending); pendingSeconds = 0;
      for (i = 0; i < pending.length; i++) { pendingSeconds += pending[i].duration; }
      nodes = []; nextTime = 0; firstTime = null; stat.playedSeconds = positionBase; stat.state = 'Paused'; report();
    }
    function resume() {
      if (stopped || !paused) { return; }
      paused = false; awaitingSince = clock(); lastAdvance = clock(); stat.state = 'Loading'; pump();
    }
    function pump() {
      var t = clock(), step, elapsed, available;
      if (stopped || paused) { return; }
      try {
        schedule();
        if (asset.decoder && !asset.decoder.waiting) {
          do {
            if (buffered() >= AHEAD) { break; }
            step = asset.decoder.decode();
          } while (step && !stopped && clock() - t < 3);
        }
        elapsed = clock() - t; stat.decodeMs += elapsed; stat.maxSliceMs = Math.max(stat.maxSliceMs,elapsed);
        if (stopped) { return; }
        schedule(); retained(); if (stopped) { return; }
        if (context.currentTime > lastAudioTime) { lastAudioTime = context.currentTime; lastAdvance = clock(); }
        if (firstTime !== null && clock() - lastAdvance > 8000) { fail('Web Audio clock is stalled. Start the test with OK on the remote.'); return; }
        if (options.seconds && clock() - startedWall > (options.seconds + 30) * 1000) { fail('Benchmark timed out.'); return; }
        available = asset.decoder ? asset.decoder.stream.remainingBytes() : 0;
        stat.remainingEncodedBytes = available;
        if (!ended && buffered() < AHEAD && (available < CHUNK || asset.decoder && asset.decoder.waiting)) { requestChunk(); }
        if (options.seconds && stat.playedSeconds >= options.seconds) { finish('Complete'); return; }
        if (ended && buffered() <= 0 && !step) { finish('Complete'); return; }
        if (firstTime === null && clock() - awaitingSince > 20000) { fail('Decoder did not start within 20 seconds.'); return; }
        if (clock() - lastReport > 500) { lastReport = clock(); report(); }
      } catch (error) { fail('Decoder failed: ' + (error.name || 'Error')); return; }
      timer = setTimeout(pump,10);
    }
    try {
      if (!sharedContext) { sharedContext = new (window.AudioContext || window.webkitAudioContext)(); }
      context = sharedContext; if (context.resume) { context.resume(); }
      analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
      spectrumRange();
      if (options.muted || options.volume !== undefined) { gain = (context.createGain || context.createGainNode).call(context); gain.gain.value = options.muted ? 0 : options.volume; analyser.connect(gain); gain.connect(context.destination); }
      else { analyser.connect(context.destination); }
      stat.outputSampleRate = context.sampleRate; stat.contextState = context.state || 'legacy';
      bins = new Uint8Array(analyser.frequencyBinCount);
      var wave = new Uint8Array(analyser.fftSize);
      source = new AV.EventEmitter(); source.start = function () {}; source.pause = function () {};
      asset = new AV.Asset(source);
      asset.on('format',function (value) {
        format = value; stat.sampleRate = value.sampleRate; stat.channels = value.channelsPerFrame;
        if (stat.channels < 1 || stat.channels > 2 || stat.sampleRate > 96000) { fail('Prototype supports mono/stereo up to 96 kHz.'); }
      });
      asset.on('data',function (pcm) {
        var frames, buffer, channel, samples, i;
        if (stopped || !format) { return; }
        frames = pcm.length / stat.channels;
        buffer = context.createBuffer(stat.channels,frames,stat.sampleRate);
        for (channel = 0; channel < stat.channels; channel++) { samples = buffer.getChannelData(channel); for (i = 0; i < frames; i++) { samples[i] = pcm[i * stat.channels + channel]; } }
        pending.push(buffer); pendingSeconds += buffer.duration; stat.decodedSeconds += buffer.duration;
      });
      asset.on('error',function (error) { if (!stopped) { fail('Decoder: ' + String(error && error.message || error || 'unsupported audio frame').slice(0,120)); } });
      asset.start(false);
      /* Buffer sources feed the analyser directly; the media-element bridge is not used. */
      pump();
    } catch (error) { fail('Streaming decoder unavailable: ' + (error.name || 'Error')); }
    return {stop:function () { finish('Stopped'); },pause:pause,resume:resume,position:position,volume:function (value) { if (gain) { gain.gain.value = Math.max(0,Math.min(1,value)); } },stats:function () { return stat; },waveform:function () { if (stopped || paused || !analyser) { return null; } analyser.getByteTimeDomainData(wave); return wave; },spectrum:function () {
      var i; if (stopped || paused || !analyser) { return null; } spectrumRange(); analyser.getByteFrequencyData(bins);
      for (i = 0; i < bins.length; i++) { stat.peak = Math.max(stat.peak,bins[i]); } return bins;
    }};
  }
  return {start:start,unlock:unlock};
}());
