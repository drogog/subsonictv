var MusicPanel = (function () {
  'use strict';
  var active = false, mode = '', title = '', items = [], focus = 0, stack = [], request = null, generation = 0, busy = false, message = '', query = '', keyFocus = 0, selected = null, queueAt = -1, callback;
  var lastQueue = '', onplay = function () {};
  var mixSeed = null, mixExpected = null;
  var keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(['Space','Delete','Clear','Search']);
  function $(id) { return document.getElementById(id); }
  function cancel() { generation++; if (request) { request.cancel(); request = null; } busy = false; mixExpected = null; }
  function close() { cancel(); active = false; $('music-panel').className = 'hidden'; stack = []; if (callback) { callback(); } }
  function snapshot() { return {mode:mode,title:title,items:items,focus:focus,message:message}; }
  function back() { cancel(); if (stack.length) { var s = stack.pop(); mode = s.mode; title = s.title; items = s.items; focus = s.focus; message = s.message; if (mode === 'queue') { queueRows(); } draw(); } else { close(); } }
  function begin(next,label,onclose) { cancel(); active = true; mode = next; title = label; focus = 0; items = []; stack = []; message = ''; callback = onclose; }
  function draw() {
    var list = $('music-list'), row, name, detail, i, first = Math.floor(focus / 7) * 7;
    $('music-panel').className = 'music-panel' + (mode === 'mix' ? ' mix-card' : ''); $('music-title').textContent = title; $('music-message').textContent = message;
    $('music-input').className = mode === 'search' ? 'music-input' : 'hidden'; $('music-input').textContent = query || 'Type a song, album or artist…';
    list.textContent = ''; list.className = mode === 'search' ? 'search-keys' : '';
    if (mode === 'search') {
      for (i = 0; i < keys.length; i++) { row = document.createElement('div'); row.className = 'search-key' + (i === keyFocus ? ' focused' : ''); row.textContent = keys[i]; list.appendChild(row); }
      $('music-help').textContent = 'OK  Type     Green  Search     Back'; return;
    }
    for (i = first; i < Math.min(first + 7,items.length); i++) {
      row = document.createElement('div'); row.className = 'music-row' + (items[i].disabled ? ' unavailable' : '') + (i === focus ? ' focused' : '');
      name = document.createElement('span'); name.className = 'music-name'; name.textContent = items[i].label; row.appendChild(name);
      detail = document.createElement('span'); detail.className = 'music-detail'; detail.textContent = items[i].detail || ''; row.appendChild(detail); list.appendChild(row);
    }
    $('music-help').textContent = mode === 'queue' ? '← →  Move     Green  Play     Yellow  Remove     OK  Options     Back' : 'OK  Select     Green / Yellow  Page     Back';
    if (items.length) { $('music-help').textContent += '     ' + (focus + 1) + ' / ' + items.length; }
    if (mode === 'mix') { $('music-help').textContent = busy ? 'Building mix…     Back  Cancel' : 'OK  Start     Back'; }
  }
  function fetch(method,params,done) {
    cancel(); var token = generation; busy = true; message = 'Loading…'; draw();
    request = MusicAPI.request(method,params,function (error,data) {
      if (!active || token !== generation) { return; } request = null; busy = false;
      if (error) { message = error + ' Back to return and try again.'; draw(); return; }
      message = ''; done(data); draw();
    });
  }
  function entries(data) {
    var result = [], groups = ['artist','album','song'], g, j, values, t;
    for (g = 0; g < groups.length; g++) { values = data[groups[g]] || []; for (j = 0; j < values.length; j++) { t = values[j]; if (!t.isVideo) { result.push({label:t.title || t.name || 'Untitled',detail:groups[g] === 'song' ? t.artist || 'Song' : groups[g] === 'album' ? 'Album · ' + (t.artist || '') : 'Artist',kind:groups[g],track:t}); } } }
    return result;
  }
  function search(offset) {
    if (!query.replace(/\s/g,'')) { message = 'Enter a title or artist first.'; draw(); return; }
    if (mode === 'search') { stack.push(snapshot()); }
    mode = 'results'; title = 'Search · ' + query; focus = 0;
    fetch('search3',{query:query,artistCount:offset ? 0 : 20,albumCount:offset ? 0 : 20,songCount:50,songOffset:offset},function (data) {
      var found = data.searchResult3 || {}; items = entries(found);
      if (offset) { items.unshift({label:'Previous songs',action:function () { search(Math.max(0,offset-50)); }}); }
      if ((found.song || []).length === 50) { items.push({label:'More songs',action:function () { search(offset+50); }}); }
      message = items.length ? '' : 'No matches. Back to change your search.';
    });
  }
  function queueRows() {
    var state = MusicPlayer.status(); items = MusicPlayer.tracks().map(function (t,i) { return {label:(i+1) + '. ' + (t.title || 'Untitled'),detail:i === state.index ? state.state + ' · CURRENT' : t.artist || '',track:t,kind:'song'}; });
    focus = Math.max(0,Math.min(focus,items.length-1)); message = items.length ? state.mixLabel || '' : 'Your queue is empty. Add songs from your library or search.';
  }
  function actions(track,at) {
    cancel(); if (active) { stack.push(snapshot()); } else { begin('actions','Song options'); }
    mode = 'actions'; title = track.title || 'Song options'; focus = 0; selected = track; queueAt = at === undefined ? -1 : at;
    mixSeed = typeof SeedMix !== 'undefined' ? SeedMix.metadata(track,{}) : track;
    actionRows(); draw();
    if (!track.radio) { fetch('getSong',{id:track.id},function (data) { if (data.song && data.song.id === track.id) { Listening.setFavourite(track,!!data.song.starred); if (typeof SeedMix !== 'undefined') { mixSeed = SeedMix.metadata(track,data.song); } } actionRows(); }); }
  }
  function mixMenu() {
    stack.push(snapshot()); mode = 'mix'; title = 'Start mix'; focus = 0;
    items = ['track','album','artist'].map(function (kind) {
      return {label:kind === 'track' ? 'Track mix' : kind === 'album' ? 'Album mix' : 'Artist mix',detail:kind === 'track' ? mixSeed.title || 'Current song' : kind === 'album' ? mixSeed.album || 'Unknown album' : mixSeed.artist || 'Unknown artist',disabled:SeedMix.unavailable(mixSeed,kind),action:function () { startMix(kind); }};
    });
    items.push({label:'Back',action:back}); message = 'Keeps this song playing. Replaces upcoming songs.'; draw();
  }
  function matchesMix(state, expected) {
    return state.track === expected.track && state.index === expected.index && state.revision === expected.revision && state.playbackRevision === expected.playbackRevision;
  }
  function startMix(kind) {
    var expected = MusicPlayer.status();
    if (expected.track !== selected || expected.index !== queueAt) { message = 'The playing song changed. Back to open its options.'; draw(); return; }
    cancel(); var token = generation, completed = false;
    busy = true; mixExpected = expected; message = 'Finding songs…'; draw();
    var handle = SeedMix.build(mixSeed,kind,function (error,result) {
      completed = true;
      if (!active || token !== generation) { return; }
      busy = false; request = null; mixExpected = null;
      if (!matchesMix(MusicPlayer.status(),expected)) { message = 'Mix cancelled: the song or queue changed.'; draw(); return; }
      if (error) { message = error + ' Your queue is unchanged.'; draw(); return; }
      var label = result.label + ' · ' + result.method + (result.partial ? ' · Limited sample' : '');
      if (!MusicPlayer.replaceUpcoming(result.tracks,expected,label)) { message = 'Mix could not be applied. Your queue is unchanged.'; draw(); return; }
      begin('queue','Queue'); focus = Math.min(expected.index + 1,MusicPlayer.status().count - 1); queueRows(); draw();
    });
    if (!completed) { request = handle; }
  }
  function actionRows() {
    var track = selected;
    items = [{label:'Play now',action:function () { if (queueAt >= 0) { MusicPlayer.jump(queueAt); } else { MusicPlayer.queue([track],0); } onplay(); close(); }},
      {label:'Play next',detail:'After the current song',action:function () { MusicPlayer.enqueue([track],true); message = 'Added to play next.'; draw(); }},
      {label:'Add to queue',detail:'At the end',action:function () { MusicPlayer.enqueue([track],false); message = 'Added to the queue.'; draw(); }}];
    if (queueAt >= 0) { items = items.slice(0,1); }
    if (!track.radio) { items.push({label:Listening.favourite(track) ? 'Remove from favourites' : 'Add to favourites',detail:'',action:function () {
      var value = !Listening.favourite(track);
      fetch(value ? 'star' : 'unstar',{id:track.id},function () { Listening.setFavourite(track,value); actionRows(); message = value ? 'Added to favourites.' : 'Removed from favourites.'; });
    }}); }
    if (!track.radio && typeof SeedMix !== 'undefined' && MusicPlayer.status().track === track && MusicPlayer.status().index === queueAt) { items.push({label:'Start mix',detail:'Track, album or artist',action:mixMenu}); }
    if (queueAt >= 0) { items.push({label:'Remove from queue',action:function () { MusicPlayer.remove(queueAt); back(); }}); }
    items.push({label:'Back',action:back}); message = MusicPlayer.status().track === track && MusicPlayer.status().normalization && MusicPlayer.status().normalization !== 'Normalization off' ? MusicPlayer.status().normalization : '';
  }
  function select() {
    var entry = items[focus]; if (!entry) { return; }
    if (entry.disabled) { message = entry.disabled; draw(); return; }
    if (entry.action) { entry.action(); return; }
    if (entry.kind === 'song') { actions(entry.track,mode === 'queue' ? focus : -1); return; }
    stack.push(snapshot()); focus = 0; title = entry.label; mode = 'results';
    fetch(entry.kind === 'artist' ? 'getArtist' : 'getAlbum',{id:entry.track.id},function (data) { items = entries(entry.kind === 'artist' ? data.artist || {} : data.album || {}); if (!items.length) { message = 'Nothing here yet.'; } });
  }
  function handle(event) {
    if (!active) { return false; } var code = event.keyCode, value;
    if ([415,19,413,10252,10233,10232].indexOf(code) >= 0) { return false; }
    if (code === 10009 || code === 27 || (code === 8 && mode !== 'search')) { back(); return true; }
    if (busy) { return true; }
    if (mode === 'search') {
      if (code === 404) { search(0); return true; }
      if (code === 8) { query = query.slice(0,-1); }
      else if (code >= 37 && code <= 40) { keyFocus = Math.max(0,Math.min(keys.length-1,keyFocus + (code === 37 ? -1 : code === 39 ? 1 : code === 38 ? -8 : 8))); }
      else if (code === 13) { value = keys[keyFocus]; if (value === 'Search') { search(0); return true; } if (value === 'Delete') { query = query.slice(0,-1); } else if (value === 'Clear') { query = ''; } else if (query.length < 100) { query += value === 'Space' ? ' ' : value; } }
      else if (event.key && event.key.length === 1 && query.length < 100) { query += event.key; }
      draw(); return true;
    }
    if (mode === 'queue' && items.length) {
      if (code === 37 || code === 39) { var to = Math.max(0,Math.min(items.length-1,focus + (code === 37 ? -1 : 1))); MusicPlayer.move(focus,to); focus = to; queueRows(); draw(); return true; }
      if (code === 404) { MusicPlayer.jump(focus); queueRows(); draw(); return true; }
      if (code === 405) { MusicPlayer.remove(focus); queueRows(); draw(); return true; }
    }
    if (code === 38 || code === 40 || code === 404 || code === 405) { focus = Math.max(0,Math.min(items.length-1,focus + (code === 38 ? -1 : code === 40 ? 1 : code === 404 ? -7 : 7))); draw(); }
    else if (code === 13) { select(); }
    return true;
  }
  return {onPlay:function (fn) { onplay = fn; },isOpen:function () { return active; },handle:handle,actions:actions,
    queue:function () { begin('queue','Queue'); focus = Math.max(0,MusicPlayer.status().index); queueRows(); draw(); },
    search:function () { begin('search','Search'); keyFocus = 0; draw(); },
    favourites:function () { begin('favourites','Favourites'); fetch('getStarred2',{},function (data) { items = entries(data.starred2 || {}); items.forEach(function (e) { if (e.kind === 'song') { Listening.setFavourite(e.track,true); } }); message = items.length ? '' : 'No favourites yet. Open Song options to add one.'; }); },
    update:function () {
      if (!active) { return; }
      var s = MusicPlayer.status();
      if (mixExpected && !matchesMix(s,mixExpected)) { cancel(); message = 'Mix cancelled: the song or queue changed.'; draw(); }
      if (mode === 'queue') { var signature = s.revision + ':' + s.index + ':' + s.state; if (signature !== lastQueue) { lastQueue = signature; queueRows(); draw(); } }
    }
  };
}());
