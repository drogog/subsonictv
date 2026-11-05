var MusicAPI = (function () {
  'use strict';
  var config = SUBSONIC_CONFIG;
  function url(method, params, override) {
    var server = override || config;
    var query = { u: server.username, t: server.token, s: server.salt,
      v: '1.15.0', c: config.client, f: 'json' };
    var key, parts = [];
    for (key in params) { if (params.hasOwnProperty(key)) { query[key] = params[key]; } }
    for (key in query) { if (query.hasOwnProperty(key)) { parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key])); } }
    return server.url.replace(/\/+$/, '') + '/rest/' + method + '.view?' + parts.join('&');
  }
  function request(method, params, callback, override) {
    var xhr = new XMLHttpRequest(), finished = false, timer;
    function finish(error, data) {
      if (finished) { return; }
      finished = true; clearTimeout(timer); callback(error, data);
    }
    xhr.onload = function () {
      var response;
      if (xhr.status < 200 || xhr.status >= 300) { finish('Server returned HTTP ' + xhr.status + '.'); return; }
      try { response = JSON.parse(xhr.responseText)['subsonic-response']; }
      catch (error) { finish('Server returned invalid JSON.'); return; }
      if (!response || response.status !== 'ok') {
        finish('Subsonic request failed' + (response && response.error ? ' (code ' + response.error.code + ')' : '') + '.'); return;
      }
      finish(null, response);
    };
    xhr.onerror = function () { finish('Network error. Check the server connection.'); };
    timer = setTimeout(function () { finish('Request timed out.'); xhr.abort(); }, 12000);
    try { xhr.open('GET', url(method, params, override), true); xhr.send(null); }
    catch (error) { finish('Unable to send request.'); }
    return { cancel: function () { finished = true; clearTimeout(timer); xhr.abort(); } };
  }
  return { url: url, request: request };
}());
