var AudioFormat = (function () {
  'use strict';
  function mime(type) {
    var value = String(type || '').split(';')[0].toLowerCase();
    var names = {'audio/mpeg':'MP3','audio/mp3':'MP3','audio/flac':'FLAC','audio/x-flac':'FLAC','audio/ogg':'OGG','application/ogg':'OGG','audio/opus':'OPUS','audio/aac':'AAC','audio/aacp':'AAC','audio/mp4':'M4A','audio/x-m4a':'M4A','audio/wav':'WAV','audio/x-wav':'WAV','audio/wave':'WAV','audio/aiff':'AIFF','audio/x-aiff':'AIFF','audio/x-ms-wma':'WMA'};
    return names[value] || '';
  }
  function source(track) { return track.suffix ? String(track.suffix).toUpperCase() : mime(track.contentType); }
  function describe(track, streamType, pending) {
    var original = source(track), delivered = mime(streamType), parts = [], details = [];
    if (track.radio) { return delivered ? delivered + ' · Live radio' : 'Live radio · Format unavailable'; }
    if (delivered) { parts.push(delivered + ' stream'); if (original && original !== delivered) { parts.push('from ' + original); } }
    else { parts.push((original || 'Unknown format') + ' source'); parts.push(pending ? 'Checking stream…' : 'Stream format unverified'); }
    if (Number(track.bitDepth) > 0) { details.push(track.bitDepth + '-bit'); }
    if (Number(track.samplingRate) > 0) { details.push(Math.round(track.samplingRate / 100) / 10 + ' kHz'); }
    if (Number(track.bitRate) > 0) { details.push(track.bitRate + ' kbps'); }
    if (details.length) { parts.push('Source: ' + details.join(' / ')); }
    return parts.join(' · ');
  }
  function inspect(track, url, callback) {
    var xhr = new XMLHttpRequest(), done = false, timer;
    function finish(type) { if (done) { return; } done = true; clearTimeout(timer); callback(describe(track,type,false)); }
    xhr.onload = function () { finish(xhr.status >= 200 && xhr.status < 300 ? xhr.getResponseHeader('Content-Type') : ''); };
    xhr.onerror = function () { finish(''); };
    timer = setTimeout(function () { finish(''); xhr.abort(); },5000);
    try { xhr.open('HEAD',url,true); xhr.send(null); } catch (error) { finish(''); }
    return {cancel:function () {done = true; clearTimeout(timer); xhr.abort();}};
  }
  return {describe:describe, inspect:inspect};
}());
