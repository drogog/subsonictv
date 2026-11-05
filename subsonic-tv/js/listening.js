/* Small metadata-only session and gain helpers. No media bytes are persisted. */
var Listening = (function () {
  'use strict';
  var key = 'subsonic-tv-session-v1', last = '', favouriteState = {};
  function owner() { return SUBSONIC_CONFIG.url + '\n' + SUBSONIC_CONFIG.username; }
  function compact(track) {
    var result = {}, fields = ['id','title','artist','album','coverArt','suffix','duration','bitRate','samplingRate','bitDepth','genre','starred','replayGain'], i, value;
    for (i = 0; i < fields.length; i++) { value = track[fields[i]]; if (value !== undefined) { result[fields[i]] = typeof value === 'string' ? value.slice(0,256) : value; } }
    return result;
  }
  function save(queue,index,revision) {
    if (!AppSettings.values.restoreSession) { return; }
    var signature = owner() + ':' + revision + ':' + index, start, tracks;
    if (signature === last) { return; } last = signature;
    try {
      if (!queue.length || !queue[index] || queue[index].radio) { localStorage.removeItem(key); return; }
      start = Math.max(0,index - 100); tracks = queue.slice(start,start + 500).filter(function (t) { return !t.radio; }).map(compact);
      localStorage.setItem(key,JSON.stringify({owner:owner(),tracks:tracks,index:index-start}));
    } catch (error) { /* Playback remains available if TV storage is full. */ }
  }
  function restore() {
    if (!AppSettings.values.restoreSession) { return null; }
    try {
      var data = JSON.parse(localStorage.getItem(key) || 'null');
      if (!data || data.owner !== owner() || !Array.isArray(data.tracks) || data.tracks.length > 500 || data.index < 0 || data.index % 1 || data.index >= data.tracks.length) { return null; }
      if (!data.tracks.every(function (t) { return t && typeof t.id === 'string' && t.id.length && !t.radio; })) { return null; }
      return data;
    } catch (error) { return null; }
  }
  function gain(track) {
    var mode = AppSettings.values.normalization || 0, tags = track && track.replayGain, db, peak, value;
    if (!mode) { return {value:1,label:'Normalization off'}; }
    if (!track || track.radio || AppSettings.values.quality) { return {value:1,label:'Normalization: original library audio only'}; }
    if (!tags) { return {value:1,label:'Normalization: no ReplayGain tags'}; }
    db = mode === 2 && typeof tags.albumGain === 'number' ? tags.albumGain : tags.trackGain;
    peak = mode === 2 && typeof tags.albumGain === 'number' ? tags.albumPeak : tags.trackPeak;
    if (typeof db !== 'number' || !isFinite(db)) { return {value:1,label:'Normalization: no ReplayGain tags'}; }
    value = Math.min(1,Math.pow(10,Math.max(-60,Math.min(30,db)) / 20));
    if (typeof peak === 'number' && isFinite(peak) && peak > 0) { value = Math.min(value,1 / peak); }
    return {value:value,label:(mode === 2 ? 'Album' : 'Track') + ' normalization · ' + (20 * Math.log(value) / Math.LN10).toFixed(1) + ' dB'};
  }
  function favourite(track) { return favouriteState.hasOwnProperty('$' + track.id) ? favouriteState['$' + track.id] : !!track.starred; }
  return {save:save,restore:restore,gain:gain,compact:compact,favourite:favourite,
    setFavourite:function (track,value) { favouriteState['$' + track.id] = value; track.starred = value ? new Date().toISOString() : ''; },
    forget:function () { last = ''; try { localStorage.removeItem(key); } catch (error) {} }
  };
}());

var IdleFullscreen = (function () {
  'use strict';
  var since = Date.now();
  function touch() { since = Date.now(); }
  document.addEventListener('visibilitychange',touch);
  return {touch:touch,update:function (state,blocked) {
    var delay = AppSettings.values.autoFullscreen || 0;
    if (!delay || blocked || document.hidden || state.state !== 'Playing' || !state.track) { touch(); return; }
    if (Date.now() - since >= delay * 1000) { touch(); ArtworkView.open(); }
  }};
}());
