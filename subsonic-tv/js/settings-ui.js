var SettingsPanel = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var active = false, page = 'main', focus = 0, closeCallback, draft, request, testing = false, generation = 0;
  var editing = '', input = '', keyFocus = 0, upper = false;
  var genres = null, genreRequest = null, genreError = '';
  function loadGenres() {
    if (genres || genreRequest) { return; }
    var token = generation; genreError = '';
    genreRequest = MusicAPI.request('getGenres',{},function (error,data) {
      if (token !== generation) { return; } genreRequest = null;
      if (error) { genreError = error + ' Select Genre to retry.'; }
      else { genres = (data.genres && data.genres.genre || []).map(function (g) { return typeof g === 'string' ? g : g.value || g.name || ''; }).filter(function (g) { return !!g; }).sort(); if (AppSettings.values.mixMode === 2 && genres.length && genres.indexOf(AppSettings.values.mixGenre) < 0) { AppSettings.set('mixGenre',genres[0]); } }
      if (active && (page === 'mix' || page === 'genres')) { draw(); }
    });
  }
  var chars = '1234567890-_' + 'qwertyuiop@.' + 'asdfghjkl:/?' + 'zxcvbnm#&=+!' + '$%*()[]{};,~' + '"\'\\|^`<>:/.=';
  var actions = ['Shift', 'Space', 'Delete', 'Done'];
  function message(value) { $('settings-message').textContent = value; }
  function rows() {
    var v = AppSettings.values;
    if (page === 'playback') { return [['Auto fullscreen',v.autoFullscreen ? v.autoFullscreen + ' seconds idle' : 'Off'],['Repeat',['Off','One song','All songs'][v.repeat]],['Restore last queue',v.restoreSession ? 'On · starts paused' : 'Off'],['Loudness normalization',['Off','Track ReplayGain','Album ReplayGain'][v.normalization]],['Back','Return to settings']]; }
    if (page === 'mix') { var mixRows = [['Mode',['Default','Random songs','Random songs from same genre'][v.mixMode]]]; if (v.mixMode === 2) { mixRows.push(['Genre',v.mixGenre || (genreRequest ? 'Loading…' : 'Select a genre')]); } mixRows.push(['Back','Return to settings']); return mixRows; }
    if (page === 'genres') { return (genres || []).map(function (g) { return [g,g === v.mixGenre ? 'Selected' : '']; }); }
    if (page === 'quality') { return [['Format',AppSettings.qualityNames[v.quality]],['Bitrate',v.quality ? v.bitrate + ' kbps' : 'Original — no bitrate limit'],['Streaming decoder test','MP3 / FLAC · 30 s each'],['Playback engine',v.engine ? 'TV compatibility' : 'Reactive audio · original MP3 / FLAC'],['Back','Return to settings']]; }
    if (page === 'visualizer') { return [['Default fullscreen',['Cover art','Ambient motion','Music visualization','Spinning LP'][v.display]],['Visualization style',AppSettings.visualizerNames[v.visualizer]],['Effect',AppSettings.effectNames[v.effect]],['Spectrum sensitivity',(v.sensitivity > 0 ? '+' : '') + v.sensitivity + ' dB' + (v.sensitivity === 0 ? ' · Balanced' : v.sensitivity < 0 ? ' · Lower' : ' · Higher')],['Saturation indicator',v.saturation ? 'Red spectrum tips' : 'Off'],['Keep screen awake',['Off','While playing','While the app is open'][v.keepAwake]],['Back','Return to settings']]; }
    if (page === 'about') { return [['Back','Return to settings']]; }
    if (page === 'server') { return [['Server URL', draft.url || 'Not configured'], ['Username', draft.username || 'Not configured'], ['Password', draft.password ? '•••••••• (new password)' : 'Unchanged — enter to replace'], ['Save and test', testing ? 'Connecting…' : 'Verify connection, then restart app']]; }
    return [['Server setup', 'Connection & account'], ['Play / pause fade', v.fade ? v.fade + ' ms' : 'Off'], ['Accent colour', AppSettings.names[v.accent]], ['Focus colour', AppSettings.names[v.focus]], ['Background', ['Charcoal','Midnight','Black'][v.background]], ['Default fullscreen', ['Cover art','Ambient motion','Music visualization','Spinning LP'][v.display]], ['Audio quality',AppSettings.qualityNames[v.quality] + (v.quality ? ' · ' + v.bitrate + ' kbps' : '')],['Visualization settings',AppSettings.visualizerNames[v.visualizer]],['Theme',['Classic','Lounge · bottom dock','Midnight'][v.theme]],['Track Mix',['Default','Random songs','By genre'][v.mixMode]],['Listening preferences','Repeat, resume, fullscreen & volume'],['About','SubsonicTV · Dramak']];
  }
  function draw() {
    var data = rows(), i, row, label, value, first = Math.max(0,Math.min(focus - 6,data.length - 7));
    $('settings-title').textContent = page === 'server' ? 'Server setup' : page === 'quality' ? 'Audio quality' : page === 'visualizer' ? 'Visualization' : page === 'about' ? 'About SubsonicTV' : 'Settings';
    $('settings-panel').className = 'settings-panel' + (data.length >= 7 ? ' compact' : '');
    $('settings-list').textContent = '';
    if (page === 'playback') { $('settings-title').textContent = 'Listening preferences'; message(['Opens your default fullscreen view after no remote input while music plays. Menus and search stay open until you leave them.','One song repeats at its end; All songs loops the queue. Next still moves to another song.','Restores up to 500 nearby queue entries as small metadata only. No audio is stored. Playback stays paused; Play starts the selected song from the beginning.','Uses ReplayGain tags for original library audio. Album falls back to track tags. Attenuation only: never boosts above source volume. Missing tags stay unchanged. Applies immediately.','Return to settings.'][focus]); }
    if (page === 'mix') { $('settings-title').textContent = 'Track Mix'; message(genreError || ['Default picks up to 50 songs from a fresh 200-song sample. It balances artists, reduces recent repeats and favours ratings or favourites when provided by the server.','Random songs plays up to 50 randomly selected library tracks, without personal weighting. Select Track mix in navigation to start a fresh queue.','Plays up to 50 random songs from the selected genre, using your server’s genre tags. Green / Yellow pages through the genre picker.'][AppSettings.values.mixMode]); }
    if (page === 'genres') { $('settings-title').textContent = 'Choose genre'; message('Select a genre for Track Mix. ' + (focus + 1) + ' / ' + data.length); }
    if (page === 'about') {
      var copy = ['Created by Dramak','Your Navidrome or Subsonic music library, on an older Samsung Tizen TV.','Browse albums, artists, playlists and radio with your remote. Track Mix builds a listening queue from your library.','Music streams from your server. Original MP3 and FLAC drive the reactive visuals as they play, without loading the whole song first. Other formats and radio use TV playback.','Appearance, playback preferences and server setup are saved on this TV.'];
      for (i = 0; i < copy.length; i++) { var paragraph = document.createElement('p'); paragraph.className = i ? 'about-copy' : 'about-author'; paragraph.textContent = copy[i]; $('settings-list').appendChild(paragraph); }
      message('');
    }
    if (page === 'visualizer') {
      message([
        'Choose the view shown when you open Fullscreen. Ambient motion is decorative.',
        'Bars and Orbit show frequency energy. Waveform follows the audio signal over time.',
        ['Clean redraws each frame.','Soft trails let the previous frames fade away.','Bass pulse varies brightness with low-frequency energy.'][AppSettings.values.effect],
        'Lower values reduce spectrum sensitivity. Applies immediately to bars and Orbit; audio volume and waveform stay unchanged.',
        'Red tips mean the spectrum reached its display ceiling. This does not measure audio distortion.',
        (typeof ScreenAwake !== 'undefined' ? ScreenAwake.status() + '. ' : '') + 'Applies only while this app is visible. TV sleep timers remain separate.',
        'Return to settings.'][focus]);
    }
    for (i = first; i < Math.min(first + 7,data.length); i++) {
      row = document.createElement('div'); row.className = 'setting-row' + (i === focus ? ' focused' : '');
      label = document.createElement('span'); label.textContent = data[i][0]; row.appendChild(label);
      value = document.createElement('span'); value.className = 'setting-value'; value.textContent = data[i][1]; row.appendChild(value);
      $('settings-list').appendChild(row);
    }
    $('settings-help').textContent = page === 'about' ? 'OK / Back' : page === 'server' ? 'OK  Edit     Back  Cancel' : '← → / OK  Change     Back';
    if (page === 'genres') { $('settings-help').textContent = 'OK  Select     Green / Yellow  Page     Back'; }
    else if (page === 'main') { $('settings-help').textContent += '     ' + (first + 1) + '–' + Math.min(first + 7,data.length) + ' / ' + data.length; }
  }
  function close() {
    generation++; if (request) { request.cancel(); request = null; } testing = false; active = false;
    if (genreRequest) { genreRequest.cancel(); genreRequest = null; }
    editing = ''; input = ''; draft = null; $('keyboard').className = 'hidden'; $('settings-panel').className = 'hidden';
    if (closeCallback) { closeCallback(); }
  }
  function keyboard() {
    var i, cell, label;
    $('keyboard').className = 'keyboard'; $('keyboard-title').textContent = editing === 'url' ? 'Server URL' : editing === 'username' ? 'Username' : 'Password';
    $('keyboard-value').textContent = editing === 'password' ? new Array(input.length + 1).join('•') : input || ' ';
    $('keyboard-keys').textContent = '';
    for (i = 0; i < chars.length + 4; i++) {
      cell = document.createElement('div'); cell.className = 'keyboard-key' + (i >= chars.length ? ' keyboard-action' : '') + (i === keyFocus ? ' focused' : '');
      label = i >= chars.length ? actions[i - chars.length] : chars.charAt(i);
      cell.textContent = upper && i < chars.length ? label.toUpperCase() : label; $('keyboard-keys').appendChild(cell);
    }
  }
  function edit() {
    editing = ['url','username','password'][focus]; input = draft[editing]; keyFocus = 0; upper = false; keyboard();
  }
  function save() {
    var server = {url:draft.url.replace(/^\s+|\s+$/g,'').replace(/\/+$/,''), username:draft.username.replace(/^\s+|\s+$/g,''), token:SUBSONIC_CONFIG.token, salt:SUBSONIC_CONFIG.salt};
    var token;
    if (!draft.password && (server.url !== SUBSONIC_CONFIG.url || server.username !== SUBSONIC_CONFIG.username)) { message('Enter the password for this server and account.'); return; }
    if (draft.password) {
      server.salt = Date.now().toString(16) + Math.random().toString(16).slice(2);
      try { server.token = subsonicMD5(draft.password + server.salt); } catch (error) { message('Password contains an invalid character. Please edit it.'); return; }
    }
    if (!AppSettings.validServer(server)) { message('Enter an HTTP(S) server URL, username and password. Include a base path if needed.'); return; }
    testing = true; token = ++generation; message('Testing connection… Your current server remains active.'); draw();
    request = MusicAPI.request('ping', {}, function (error) {
      if (!active || token !== generation) { return; }
      testing = false; request = null;
      if (error) { message(error + ' Previous settings kept.'); draw(); return; }
      if (!AppSettings.saveServer(server)) { message('TV storage is unavailable. Previous server settings kept.'); draw(); return; }
      draft.password = ''; message('Connected. Settings saved. Restarting…'); MusicPlayer.stop(); window.location.reload();
    }, server);
  }
  function change(direction) {
    var names = ['', 'fade','accent','focus','background','display','quality'], options, name, value, position, saved;
    if (focus === 0) { page = 'server'; focus = 0; message('Blank password keeps your existing login when server and username are unchanged.'); draw(); return; }
    if (focus === 6) { page = 'quality'; focus = 0; message('Original preserves the file. Other formats request server conversion. Changes apply to the next selected track.'); draw(); return; }
    if (focus === 7) { page = 'visualizer'; focus = 0; message('In fullscreen: Down changes style, Yellow changes effect.'); draw(); return; }
    if (focus === 11) { page = 'about'; focus = 0; draw(); return; }
    if (focus === 8) { AppSettings.set('theme',(AppSettings.values.theme + direction + 3) % 3); AppSettings.apply(); message('Saved. Lounge uses Left / Right in the bottom dock and Up to return to music.'); draw(); return; }
    if (focus === 10) { page = 'playback'; focus = 0; draw(); return; }
    if (focus === 9) { page = 'mix'; focus = 0; if (AppSettings.values.mixMode === 2) { loadGenres(); } draw(); return; }
    name = names[focus]; options = name === 'fade' ? [0,250,500,1000,1500] : name === 'background' || name === 'quality' ? [0,1,2] : name === 'display' ? [0,1,2,3] : [0,1,2,3,4];
    position = options.indexOf(AppSettings.values[name]); value = options[(position + direction + options.length) % options.length];
    saved = AppSettings.set(name, value); AppSettings.apply(); message(saved ? (name === 'quality' ? 'Saved. Select the track again to apply this quality.' : name === 'display' ? 'Saved. Fullscreen opens with this view every time. Up switches views temporarily.' : 'Saved on this TV.') : 'Applied for this session. TV storage is unavailable.'); draw();
  }
  function handle(event) {
    var code = event.keyCode, index, col;
    if (!active) { return false; }
    if ([415,19,413,10252,10233,10232,447,448,449].indexOf(code) >= 0) { return false; }
    if (editing) {
      if (code === 403) { input = ''; keyboard(); return true; }
      if (code === 10009 || code === 27) { editing = ''; input = ''; $('keyboard').className = 'hidden'; return true; }
      if (code === 8) { input = input.slice(0,-1); keyboard(); return true; }
      if (code === 37 || code === 39) { keyFocus = Math.max(0, Math.min(chars.length + 3, keyFocus + (code === 37 ? -1 : 1))); }
      else if (code === 38) { keyFocus = keyFocus >= chars.length ? chars.length - 12 + (keyFocus - chars.length) * 3 : Math.max(0, keyFocus - 12); }
      else if (code === 40) { col = keyFocus % 12; keyFocus = keyFocus >= chars.length - 12 ? (keyFocus >= chars.length ? keyFocus : chars.length + Math.floor(col / 3)) : keyFocus + 12; }
      else if (code === 13) {
        index = keyFocus - chars.length;
        if (index === 0) { upper = !upper; }
        else if (index === 2) { input = input.slice(0,-1); }
        else if (index === 3) { draft[editing] = input; editing = ''; input = ''; $('keyboard').className = 'hidden'; draw(); return true; }
        else if (input.length < 256) { input += index === 1 ? ' ' : upper ? chars.charAt(keyFocus).toUpperCase() : chars.charAt(keyFocus); }
      } else if (event.key && event.key.length === 1 && input.length < 256) { input += event.key; }
      keyboard(); return true;
    }
    if (code === 10009 || code === 27 || code === 8) {
      if (testing) { generation++; request.cancel(); request = null; testing = false; message('Connection test cancelled. Previous settings kept.'); draw(); }
      else if (page === 'genres') { page = 'mix'; focus = 1; draw(); }
      else if (page === 'mix') { page = 'main'; focus = 9; message('Mix changes apply when starting the next Track mix.'); draw(); }
      else if (page === 'playback') { page = 'main'; focus = 10; message('Listening preferences saved.'); draw(); }
      else if (page === 'about') { page = 'main'; focus = 11; message(''); draw(); }
      else if (page === 'visualizer') { page = 'main'; focus = 7; message('Visualization preferences saved.'); draw(); }
      else if (page === 'quality') { page = 'main'; focus = 6; message('Quality changes apply when selecting a track again.'); draw(); }
      else if (page === 'server') { draft.password = ''; page = 'main'; focus = 0; message(''); draw(); }
      else { close(); } return true;
    }
    if (testing) { return true; }
    if (page === 'genres' && (code === 404 || code === 405)) { focus = Math.max(0,Math.min(genres.length - 1,focus + (code === 404 ? -7 : 7))); draw(); return true; }
    if (code === 38 || code === 40) { focus = Math.max(0, Math.min(rows().length - 1, focus + (code === 38 ? -1 : 1))); draw(); }
    else if (page === 'playback' && (code === 37 || code === 39 || code === 13)) {
      if (focus === 4) { page = 'main'; focus = 10; draw(); return true; }
      var pref = ['autoFullscreen','repeat','restoreSession','normalization'][focus], choices = focus === 0 ? [0,30,60,120,300] : focus === 2 ? [0,1] : [0,1,2];
      var prefSaved = AppSettings.set(pref,choices[(choices.indexOf(AppSettings.values[pref]) + (code === 37 ? -1 : 1) + choices.length) % choices.length]);
      if (pref === 'normalization' && MusicPlayer.refreshGain) { MusicPlayer.refreshGain(); }
      if (pref === 'restoreSession' && !AppSettings.values.restoreSession && typeof Listening !== 'undefined') { Listening.forget(); }
      if (MusicPlayer.refreshStatus) { MusicPlayer.refreshStatus(); }
      draw(); if (!prefSaved) { message('Applied for this session. TV storage is unavailable.'); }
    }
    else if (page === 'quality' && (code === 37 || code === 39 || code === 13)) {
      if (focus === 4) { page = 'main'; focus = 6; draw(); return true; }
      if (focus === 3) { AppSettings.set('engine',AppSettings.values.engine ? 0 : 1); message('Saved. Applies to the next selected track.'); draw(); return true; }
      if (focus === 2) { if (code === 13) { close(); DecoderBench.open(); } return true; }
      if (focus === 1 && !AppSettings.values.quality) { message('Original sends the source file unchanged, without a bitrate limit.'); return true; }
      var optionList = focus === 0 ? [0,1,2,3,4] : AppSettings.bitrates;
      var optionName = focus === 0 ? 'quality' : 'bitrate';
      var nextValue = optionList[(optionList.indexOf(AppSettings.values[optionName]) + (code === 37 ? -1 : 1) + optionList.length) % optionList.length];
      var persisted = AppSettings.set(optionName,nextValue);
      message(persisted ? 'Saved. Select the track again to apply this quality.' : 'Applied for this session. TV storage is unavailable.'); draw();
    }
    else if (page === 'visualizer' && (code === 37 || code === 39 || code === 13)) {
      if (focus === 6) { page = 'main'; focus = 7; draw(); return true; }
      var visualName = ['display','visualizer','effect','sensitivity','saturation','keepAwake'][focus];
      var visualOptions = focus === 3 ? [-12,-6,0,6,12] : focus === 4 ? [0,1] : focus === 0 || focus === 1 ? [0,1,2,3] : [0,1,2];
      var visualSaved = AppSettings.set(visualName,visualOptions[(visualOptions.indexOf(AppSettings.values[visualName]) + (code === 37 ? -1 : 1) + visualOptions.length) % visualOptions.length]);
      if (visualName === 'keepAwake' && typeof ScreenAwake !== 'undefined') { ScreenAwake.refresh(); }
      draw();
      if (!visualSaved) { message('Applied for this session. TV storage is unavailable.'); }
    }
    else if (page === 'mix' && (code === 13 || code === 37 || code === 39)) {
      if (focus === 0) { AppSettings.set('mixMode',(AppSettings.values.mixMode + (code === 37 ? -1 : 1) + 3) % 3); if (AppSettings.values.mixMode === 2) { loadGenres(); } draw(); }
      else if (focus === 1 && AppSettings.values.mixMode === 2) { if (genres && genres.length) { page = 'genres'; focus = Math.max(0,genres.indexOf(AppSettings.values.mixGenre)); draw(); } else { loadGenres(); message(genreError || (genres ? 'No genres returned by this server.' : 'Loading genres…')); } }
      else { page = 'main'; focus = 9; message('Saved for the next Track mix.'); draw(); }
    }
    else if (page === 'genres' && code === 13 && genres[focus]) { AppSettings.set('mixGenre',genres[focus]); page = 'mix'; focus = 1; draw(); }
    else if (page === 'about' && (code === 13 || code === 37)) { page = 'main'; focus = 11; message(''); draw(); }
    else if (page === 'main' && (code === 37 || code === 39 || code === 13)) { change(code === 37 ? -1 : 1); }
    else if (page === 'server' && code === 13) { if (focus === 3) { save(); } else { edit(); } }
    return true;
  }
  if (typeof ScreenAwake !== 'undefined') { ScreenAwake.listen(function () { if (active && page === 'visualizer' && focus === 5) { draw(); } }); }
  return {open:function (callback,startPage) { active = true; page = startPage || 'main'; focus = 0; closeCallback = callback; draft = {url:SUBSONIC_CONFIG.url || '',username:SUBSONIC_CONFIG.username || '',password:''}; $('settings-panel').className = 'settings-panel'; message(''); if (page === 'mix' && AppSettings.values.mixMode === 2) { loadGenres(); } draw(); }, handle:handle, isOpen:function () { return active; }};
}());
