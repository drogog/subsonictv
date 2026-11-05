var AppSettings = (function () {
  'use strict';
  var key = 'subsonic-tv-settings-v1', saved = {}, values = {accent:0, focus:0, background:0, fade:500, display:2, quality:0, bitrate:192, engine:0, visualizer:0, effect:0, sensitivity:0, saturation:1, keepAwake:1, theme:0, mixMode:0, mixGenre:'', autoFullscreen:0, repeat:0, restoreSession:1, normalization:0};
  var qualityNames = ['Original (unchanged)', 'MP3', 'Server default', 'AAC', 'Opus'];
  var bitrates = [64,96,128,160,192,256,320];
  var palette = ['#c5afff', '#86ddbd', '#88baff', '#f1ca7d', '#f1a7bf'];
  var names = ['Lavender', 'Mint', 'Blue', 'Amber', 'Rose'];
  var backgrounds = ['#17171c', '#121d29', '#080809'];
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (error) { saved = {}; }
  function valid(name, value) {
    if (name === 'autoFullscreen') { return [0,30,60,120,300].indexOf(value) >= 0; }
    if (name === 'repeat' || name === 'normalization') { return [0,1,2].indexOf(value) >= 0; }
    if (name === 'restoreSession') { return [0,1].indexOf(value) >= 0; }
    if (name === 'bitrate') { return bitrates.indexOf(value) >= 0; }
    if (name === 'sensitivity') { return [-12,-6,0,6,12].indexOf(value) >= 0; }
    if (name === 'keepAwake') { return [0,1,2].indexOf(value) >= 0; }
    if (name === 'theme' || name === 'mixMode') { return [0,1,2].indexOf(value) >= 0; }
    if (name === 'display') { return [0,1,2,3].indexOf(value) >= 0; }
    if (name === 'mixGenre') { return typeof value === 'string' && value.length <= 256; }
    return name === 'fade' ? [0,250,500,1000,1500].indexOf(value) >= 0 : typeof value === 'number' && value >= 0 && value % 1 === 0 && value < (name === 'engine' || name === 'saturation' ? 2 : name === 'visualizer' ? 4 : name === 'background' || name === 'display' || name === 'effect' ? 3 : 5);
  }
  var name;
  for (name in values) { if (values.hasOwnProperty(name) && valid(name, saved[name])) { values[name] = saved[name]; } }
  function validServer(server) {
    return server && typeof server.url === 'string' && /^https?:\/\/[^\s\/?#@]+(?::\d+)?(?:\/[^\s?#]*)?$/i.test(server.url) && typeof server.username === 'string' && server.username && /^[a-f0-9]{32}$/i.test(server.token || '') && typeof server.salt === 'string' && server.salt;
  }
  if (validServer(saved.server)) {
    SUBSONIC_CONFIG.url = saved.server.url; SUBSONIC_CONFIG.username = saved.server.username;
    SUBSONIC_CONFIG.token = saved.server.token; SUBSONIC_CONFIG.salt = saved.server.salt;
  } else { delete saved.server; }
  function persist(next) { try { localStorage.setItem(key, JSON.stringify(next)); return true; } catch (error) { return false; } }
  function snapshot() { var data = {}, k; for (k in values) { if (values.hasOwnProperty(k)) { data[k] = values[k]; } } if (saved.server) { data.server = saved.server; } return data; }
  function set(name, value) {
    if (!values.hasOwnProperty(name) || !valid(name, value)) { return false; }
    values[name] = value; return persist(snapshot());
  }
  function saveServer(server) {
    var data = snapshot();
    if (!validServer(server)) { return false; }
    data.server = {url:server.url, username:server.username, token:server.token, salt:server.salt};
    if (!persist(data)) { return false; } saved.server = data.server; return true;
  }
  function tint(hex) { var i, out = '#'; for (i = 1; i < 7; i += 2) { out += ('0' + Math.round(parseInt(hex.substr(i,2),16) * 0.25).toString(16)).slice(-2); } return out; }
  function apply() {
    var accent = palette[values.accent], focus = palette[values.focus];
    document.getElementById('stage').className = 'theme-' + values.theme;
    document.getElementById('theme').textContent = '#stage,.settings-panel{background:' + backgrounds[values.background] + ';}' +
      '.brand-tv,.eyebrow,.debug-heading,.nav-item.active,.about-author{color:' + accent + ';}' +
      '.brand-mark,#progress-fill,#mini-progress{background:' + accent + ';}' +
      '.nav-item.active{background:' + tint(accent) + ';}' +
      '.focused,.nav-item.focused,.tile.focused,.row.focused,.transport-button.focused,.setting-row.focused,.keyboard-key.focused{border-color:' + focus + ';background:' + tint(focus) + ';color:#fff;}' +
      '.debug{border-color:' + focus + ';}';
  }
  return {values:values, set:set, apply:apply, names:names, palette:palette, qualityNames:qualityNames, visualizerNames:['Spectrum bars','Mirror spectrum','Waveform','Orbit'], effectNames:['Clean','Soft trails','Bass pulse'], bitrates:bitrates, saveServer:saveServer, validServer:validServer};
}());

/* Subsonic token authentication requires MD5(password + salt). UTF-8 input. */
function subsonicMD5(input) {
  var bytes = unescape(encodeURIComponent(input)), words = [], n = bytes.length, i, j, g, f, temp, a, b, c, d;
  var state = [1732584193, -271733879, -1732584194, 271733878];
  var shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21], constants = [], result = '';
  for (i = 0; i < 64; i++) { constants[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0; }
  for (i = 0; i < n; i++) { words[i >> 2] = (words[i >> 2] || 0) | bytes.charCodeAt(i) << ((i % 4) * 8); }
  words[n >> 2] = (words[n >> 2] || 0) | 128 << ((n % 4) * 8);
  words[(((n + 8) >> 6) * 16) + 14] = n * 8;
  for (i = 0; i < words.length; i += 16) {
    a = state[0]; b = state[1]; c = state[2]; d = state[3];
    for (j = 0; j < 64; j++) {
      if (j < 16) { f = (b & c) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * j) % 16; }
      temp = (a + f + constants[j] + (words[i + g] || 0)) | 0;
      g = shifts[(j >> 4) * 4 + j % 4];
      a = d; d = c; c = b; b = (b + ((temp << g) | (temp >>> (32 - g)))) | 0;
    }
    state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
  }
  for (i = 0; i < 16; i++) { result += ('0' + ((state[i >> 2] >>> ((i % 4) * 8)) & 255).toString(16)).slice(-2); }
  return result;
}
