(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var menus = ['Home', 'Albums', 'Artists', 'Playlists', 'Radio', 'Track mix', 'All songs', 'Now playing', 'Settings', 'Search', 'Favourites'];
  var icons = [
    '<path d="M3 10.5L12 3l9 7.5M5 9v11h5v-6h4v6h5V9"/>',
    '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    '<path d="M4 5h16M4 10h16M4 15h9M4 20h9M18 14v7m-3-3 3 3 3-3"/>',
    '<rect x="3" y="8" width="18" height="13" rx="3"/><path d="m5 8 13-5M15 12h3M15 16h3"/><circle cx="8" cy="15" r="2"/>',
    '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
    '<path d="M4 5h9M4 10h9M4 15h5M18 17V4l4 2"/><ellipse cx="15" cy="18" rx="3" ry="2"/>',
    '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
    '<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 3v4l3 1 1 3 3 3h4l1-3 3-1 3-3v-4l-3-1-1-3-3-3Z"/>'
  ];
  icons.push('<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>','<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>');
  var nowIndex = 7, settingsIndex = 8, rememberedTrack = null, collecting = false;
  function dock() { return AppSettings.values && AppSettings.values.theme === 1; }
  function canShuffle() { return !nowPlaying && screen && screen.kind === 'tracks' && !screen.autoPlay; }
  var screen, stack = [], roots = {}, request, serial = 0, busy = false, retry = null;
  var navIndex = 0, section = 0, zone = 'content', nowPlaying = false, control = 1;
  var renderedPage = -1, renderedScreen = null, rows = [], lastCover = null, lastTrack = null;
  var letters = ['All','#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), letterFocus = 0, letterNodes = [], albumIndex = null, indexing = false;
  function hasLetters() { return !nowPlaying && !stack.length && (section === 1 || section === 2); }
  function initial(name) {
    var value = String(name || '').replace(/^\s+/, '').toUpperCase(), groups = ['ÀÁÂÃÄÅĀĂĄÆ','ÇĆČ','ĎĐ','ÈÉÊËĒĖĘĚ','ÌÍÎÏĪĮ','Ł','ÑŃŇ','ÒÓÔÕÖØŌŐ','ŔŘ','ŚŠŞ','ŤŢ','ÙÚÛÜŪŮŰŲ','ÝŸ','ŹŻŽ'], replacements = 'ACDEILNORSTUYZ', i;
    value = value.charAt(0);
    for (i = 0; i < groups.length; i++) { if (groups[i].indexOf(value) >= 0 && value) { value = replacements.charAt(i); break; } }
    return /^[A-Z]$/.test(value) ? value : '#';
  }
  function drawLetters() {
    var i, node, visible = hasLetters();
    $('letter-selector').className = visible ? 'letter-selector' : 'hidden';
    $('library').className = nowPlaying ? 'hidden' : visible ? 'alphabet-library' : '';
    if (!visible) { return; }
    if (!letterNodes.length) { for (i = 0; i < letters.length; i++) { node = document.createElement('span'); node.textContent = letters[i]; node.setAttribute('role','button'); $('letter-selector').appendChild(node); letterNodes.push(node); } }
    for (i = 0; i < letters.length; i++) { letterNodes[i].className = 'letter' + (i === 0 ? ' letter-all' : '') + (letters[i] === (screen && screen.letter || 'All') ? ' active' : '') + (zone === 'letters' && i === letterFocus ? ' focused' : ''); letterNodes[i].setAttribute('aria-pressed',letters[i] === (screen && screen.letter || 'All') ? 'true' : 'false'); }
  }
  function selectLetter() {
    var chosen = letters[letterFocus], base = screen && (screen.letterBase || screen), token, collected = [], seen = {}, offset = 0;
    if (!base || busy && !retry) { return; }
    function show(items) {
      var target = spec(base.kind,base.title,base.method,base.params,base.extract,base.grid), i;
      target.letter = chosen; target.letterBase = base;
      for (i = 0; i < items.length; i++) { if (chosen === 'All' || initial(items[i].name) === chosen) { target.items.push(items[i]); } }
      screen = target; busy = false; indexing = false; request = null; retry = null; zone = target.items.length ? 'content' : 'letters'; render(true);
    }
    if (chosen === 'All') { cancel(); screen = base; zone = 'content'; render(true); return; }
    if (section === 2) { cancel(); show(base.items); return; }
    if (albumIndex) { cancel(); show(albumIndex); return; }
    cancel(); token = serial; busy = true; indexing = true; retry = null;
    function batch() {
      text('notice','Building album letter index… ' + collected.length + ' albums. Back cancels.'); render();
      request = MusicAPI.request('getAlbumList2',{type:'alphabeticalByName',size:500,offset:offset},function (error,data) {
        var items, i, item, added = 0;
        if (token !== serial) { return; }
        if (error) { busy = false; indexing = false; request = null; retry = selectLetter; text('notice',error + ' Press OK to retry.'); return; }
        items = data.albumList2 && data.albumList2.album || [];
        for (i = 0; i < items.length; i++) { item = items[i]; if (!seen['id:' + item.id]) { seen['id:' + item.id] = true; collected.push({id:item.id,name:item.name,artist:item.artist,coverArt:item.coverArt,year:item.year}); added++; } }
        if (items.length === 500 && !added) { busy = false; indexing = false; retry = selectLetter; text('notice','Server repeated an album page. Press OK to retry.'); return; }
        offset += items.length;
        if (items.length === 500) { batch(); } else { albumIndex = collected; show(albumIndex); }
      });
    }
    batch();
  }
  function text(id, value) { var node = $(id); if (node.textContent !== value) { node.textContent = value; } }
  function log(message) {
    var el = $('debug-log'); el.appendChild(document.createTextNode(message + '\n'));
    while (el.childNodes.length > 80) { el.removeChild(el.firstChild); }
    el.scrollTop = el.scrollHeight;
  }
  window.onerror = function (message, source, line) { log('Error: ' + message + ' (line ' + line + ')'); };
  function resize() {
    var scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    $('stage').style.webkitTransform = 'scale(' + scale + ')'; $('stage').style.transform = 'scale(' + scale + ')';
    $('stage').style.left = ((window.innerWidth - 1280 * scale) / 2) + 'px';
    $('stage').style.top = ((window.innerHeight - 720 * scale) / 2) + 'px';
  }
  resize(); window.addEventListener('resize', resize); AppSettings.apply();
  function clock(seconds) { seconds = Math.floor(seconds || 0); return Math.floor(seconds / 60) + ':' + (seconds % 60 < 10 ? '0' : '') + seconds % 60; }
  function cancel() { serial++; if (request) { request.cancel(); request = null; } busy = false; retry = null; indexing = false; collecting = false; }
  function playCollection(shuffled) {
    var token, selected = screen.items[screen.focus], list = screen.items;
    if (busy) { return; }
    function play(items) {
      var at = 0, i;
      if (shuffled) { items = MusicCatalog.shuffle(items); }
      else { for (i = 0; i < items.length; i++) { if (selected && items[i].id === selected.id) { at = i; break; } } }
      busy = false; collecting = false; request = null;
      if (items.length) { MusicPlayer.queue(items,at); nowPlaying = true; zone = 'content'; control = 1; }
      render();
    }
    if (!screen.allSongs) { play(list); return; }
    cancel(); token = serial; busy = true; collecting = true; render();
    request = MusicCatalog.all(function (error,items) { if (token !== serial) { return; } if (error) { busy = false; collecting = false; retry = function () { playCollection(shuffled); }; text('notice',error + ' Press OK to retry.'); return; } play(items); },function (count) { text('notice','Preparing library queue… ' + count + ' songs. Metadata only. Back cancels.'); });
  }
  function art(parent, id, size) {
    var placeholder = document.createElement('span'), img;
    placeholder.className = 'art-placeholder'; placeholder.textContent = '♫'; parent.appendChild(placeholder);
    if (id) {
      img = document.createElement('img'); img.alt = '';
      img.onerror = function () { this.style.display = 'none'; };
      img.src = MusicAPI.url('getCoverArt', { id: id, size: size }); parent.appendChild(img);
    }
  }
  function drawNav() {
    var children = $('navigation').childNodes, i;
    for (i = 0; i < menus.length; i++) { children[i].className = 'nav-item' + (i === (nowPlaying ? nowIndex : section) ? ' active' : '') + (zone === 'nav' && i === navIndex ? ' focused' : ''); }
  }
  var lastToggle = '';
  function setToggle(label) {
    if (label === lastToggle) { return; } lastToggle = label;
    var button = $('toggle-control'), path = label === 'Pause' ? 'M6 4h4v16H6zM14 4h4v16h-4z' : label === 'Stop' ? 'M6 6h12v12H6z' : 'M8 4l13 8-13 8Z';
    button.setAttribute('aria-label',label);
    button.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + path + '"/></svg>';
  }
  function drawControls() {
    var ids = ['previous-control', 'toggle-control', 'next-control', 'artwork-control','queue-control','options-control'], i;
    for (i = 0; i < ids.length; i++) { $(ids[i]).className = 'transport-button' + (zone === 'content' && control === i ? ' focused' : ''); }
  }
  function render(force) {
    var size, page, start, end, i, item, row, label, detail, artwork;
    // A fetch can finish behind Now Playing. Invalidate before its early return.
    if (force) { renderedScreen = null; }
    $('library').className = nowPlaying ? 'hidden' : '';
    $('now-playing').className = nowPlaying ? '' : 'hidden';
    drawNav();
    drawLetters();
    $('shuffle-control').className = canShuffle() ? 'shuffle-control' + (zone === 'shuffle' ? ' focused' : '') : 'hidden';
    $('shuffle-control').textContent = screen && screen.allSongs ? 'Shuffle all songs' : 'Shuffle songs';
    text('help', zone === 'letters' ? 'OK  Filter     ↓  Songs     Back' : zone === 'nav' ? (dock() ? 'OK  Open     ↑  Music' : 'OK  Open     →  Music') : nowPlaying ? 'OK  Select     ↓  Queue & options     Back' : hasLetters() ? '↑  A–Z     Green / Yellow  Page     Back' : 'Green / Yellow  Page     Back');
    if (zone === 'shuffle') { text('help','OK  Shuffle     ↓  Songs     Back'); }
    else if (canShuffle()) { text('help','↑  Shuffle     Red  Options     Green / Yellow  Page     Back'); }
    if (nowPlaying) { drawControls(); return; }
    if (!screen) { return; }
    text('heading', screen.title);
    text('breadcrumb', screen.subtitle || '');
    size = screen.grid ? 8 : 7; page = Math.floor(screen.focus / size); start = page * size; end = Math.min(start + size, screen.items.length);
    text('counter',screen.items.length ? (screen.remote ? 'Page ' + (screen.offset / size + 1) : (screen.focus + 1) + ' / ' + screen.items.length) : '');
    if (force || screen !== renderedScreen || page !== renderedPage) {
      $('list').textContent = ''; rows = []; renderedPage = page; renderedScreen = screen;
      for (i = start; i < end; i++) {
        item = screen.items[i]; row = document.createElement('div'); row.className = screen.grid ? 'tile' : 'row';
        row.setAttribute('role', 'option');
        if (screen.grid) {
          artwork = document.createElement('div'); artwork.className = 'tile-art'; art(artwork, item.coverArt, 200); row.appendChild(artwork);
        } else {
          label = document.createElement('span'); label.className = 'row-number'; label.textContent = screen.kind === 'tracks' ? (i + 1) : '♪'; row.appendChild(label);
        }
        label = document.createElement('div'); label.className = screen.grid ? 'tile-title' : 'row-title'; label.textContent = item.name || item.title || 'Untitled'; row.appendChild(label);
        detail = document.createElement('div'); detail.className = screen.grid ? 'tile-subtitle' : 'row-detail';
        detail.textContent = screen.kind === 'radio' ? 'LIVE RADIO' : screen.kind === 'artists' ? (item.albumCount || 0) + ' albums' : screen.kind === 'tracks' ? clock(item.duration) : screen.kind === 'playlists' ? (item.songCount || 0) + ' tracks' : (item.artist || (item.year ? String(item.year) : 'Album'));
        row.appendChild(detail); $('list').appendChild(row); rows.push(row);
      }
    }
    for (i = 0; i < rows.length; i++) {
      rows[i].className = (screen.grid ? 'tile' : 'row') + (zone === 'content' && start + i === screen.focus ? ' focused' : '');
      rows[i].setAttribute('aria-selected', zone === 'content' && start + i === screen.focus ? 'true' : 'false');
    }
    if (!busy && !retry) { text('notice', screen.items.length ? '' : screen.letter ? 'No ' + screen.kind + ' beginning with ' + screen.letter + '. Choose another letter.' : (screen.kind === 'radio' ? 'No radio stations configured in your music server.' : screen.kind === 'playlists' ? 'No playlists yet. Create one in your music server, then reopen the app.' : 'Nothing here yet. Press Back to return.')); }
  }
  function fetchScreen(target, fallback) {
    var token;
    cancel(); screen = target; busy = true; text('notice', 'Loading your music…'); render(true); token = serial;
    request = MusicAPI.request(target.method, target.params, function (error, data) {
      if (token !== serial) { return; }
      busy = false; request = null;
      if (error) { log(target.method + ': ' + error); text('notice', error + ' Press OK to retry.'); retry = function () { fetchScreen(target, fallback); }; return; }
      target.items = target.extract(data);
      if (!target.items.length && fallback) { screen = fallback; render(true); return; }
      if (target.autoPlay && target.items.length) { MusicPlayer.queue(target.items, 0); nowPlaying = true; control = 1; text('notice', ''); }
      render(true); log(target.method + ': ' + target.items.length + ' items');
    });
  }
  function spec(kind, title, method, params, extract, grid) {
    return {kind:kind, title:title, method:method, params:params, extract:extract, grid:!!grid, items:[], focus:0, offset:0};
  }
  function openSection(index) {
    var target;
    if (typeof MusicPanel !== 'undefined' && (index === 9 || index === 10)) { if (index === 9) { MusicPanel.search(); } else { MusicPanel.favourites(); } return; }
    if (index === settingsIndex) { SettingsPanel.open(function () { if (dock()) { nowPlaying = true; } zone = 'nav'; render(); }); return; }
    if (index === nowIndex) { nowPlaying = true; zone = 'content'; render(); return; }
    if (screen && !busy && !retry && !stack.length) { roots[section] = screen; }
    cancel(); stack = []; section = index; navIndex = index; nowPlaying = false; zone = 'content';
    if (roots[index] && index !== 4 && index !== 5) { screen = roots[index]; render(true); return; }
    if (index === 2) {
      target = spec('artists', 'Artists', 'getArtists', {}, function (data) {
        var groups = data.artists && data.artists.index || [], items = [], i;
        for (i = 0; i < groups.length; i++) { items = items.concat(groups[i].artist || []); } return items;
      });
    } else if (index === 3) {
      target = spec('playlists', 'Your playlists', 'getPlaylists', {}, function (data) { return data.playlists && data.playlists.playlist || []; }, true);
    } else if (index === 4) {
      target = spec('radio', 'Radio stations', 'getInternetRadioStations', {}, function (data) { return data.internetRadioStations && data.internetRadioStations.internetRadioStation || []; });
      target.subtitle = '';
    } else if (index === 5) {
      var mixMode = AppSettings.values && AppSettings.values.mixMode || 0, mixGenre = AppSettings.values && AppSettings.values.mixGenre || '', mixParams = {size:mixMode ? 50 : 200};
      if (mixMode === 2 && !mixGenre) { SettingsPanel.open(function () { zone = 'nav'; render(); },'mix'); return; }
      if (mixMode === 2) { mixParams.genre = mixGenre; }
      target = spec('tracks', 'Your track mix', 'getRandomSongs', mixParams, function (data) { var songs = data.randomSongs && data.randomSongs.song || []; return mixMode ? MusicCatalog.shuffle(songs).slice(0,50) : TrackMix.build(songs,50); });
      target.subtitle = mixMode === 2 ? 'RANDOM · ' + mixGenre : mixMode === 1 ? 'RANDOM SONGS' : ''; target.autoPlay = true;
    } else if (index === 6) {
      target = spec('tracks','All songs','search3',MusicCatalog.params(7,0),MusicCatalog.songs); target.remote = true; target.allSongs = true; target.subtitle = '';
    } else {
      target = spec('albums', index === 0 ? 'Recently added' : 'All albums', 'getAlbumList2', {type:index === 0 ? 'newest' : 'alphabeticalByName', size:8, offset:0}, function (data) { return data.albumList2 && data.albumList2.album || []; }, true);
      target.remote = true;
    }
    fetchScreen(target);
  }
  function turnPage(direction) {
    var size, offset, target, key;
    if (!screen || busy || retry) { return; }
    size = screen.grid ? 8 : 7;
    if (!screen.remote) { screen.focus = Math.max(0, Math.min(screen.items.length - 1, screen.focus + direction * size)); render(); return; }
    offset = screen.offset + direction * size;
    if (offset < 0 || (direction > 0 && screen.items.length < size)) { return; }
    target = spec(screen.kind, screen.title, screen.method, {}, screen.extract, screen.grid);
    for (key in screen.params) { if (screen.params.hasOwnProperty(key)) { target.params[key] = screen.params[key]; } }
    target.offset = offset; target.params[screen.allSongs ? 'songOffset' : 'offset'] = offset; target.remote = true; target.allSongs = screen.allSongs;
    fetchScreen(target, screen);
  }
  function enter() {
    var item, target;
    if (zone === 'nav') { openSection(navIndex); return; }
    if (zone === 'letters') { selectLetter(); return; }
    if (zone === 'shuffle') { if (retry) { retry(); } else { playCollection(true); } return; }
    if (nowPlaying) { if (control === 0) { MusicPlayer.previous(); } else if (control === 2) { MusicPlayer.next(); } else if (control === 3) { ArtworkView.open(); } else if (control === 4) { MusicPanel.queue(); } else if (control === 5) { var current = MusicPlayer.status(); if (current.track) { MusicPanel.actions(current.track,current.index); } } else { MusicPlayer.toggle(); } return; }
    if (busy) { return; } if (retry) { retry(); return; }
    if (!screen || !screen.items.length) { return; }
    item = screen.items[screen.focus];
    if (screen.kind === 'radio') { MusicPlayer.radio(screen.items, screen.focus); nowPlaying = true; control = 1; render(); return; }
    if (screen.kind === 'tracks') { if (screen.allSongs) { playCollection(false); } else { MusicPlayer.queue(screen.items, screen.focus); nowPlaying = true; control = 1; render(); } return; }
    stack.push(screen);
    if (screen.kind === 'artists') { target = spec('albums', item.name, 'getArtist', {id:item.id}, function (data) { return data.artist && data.artist.album || []; }, true); }
    else if (screen.kind === 'playlists') { target = spec('tracks', item.name, 'getPlaylist', {id:item.id}, function (data) { return data.playlist && data.playlist.entry || []; }); target.subtitle = ''; }
    else { target = spec('tracks', item.name || item.title, 'getAlbum', {id:item.id}, function (data) { return data.album && data.album.song || []; }); target.subtitle = item.artist || 'ALBUM'; }
    fetchScreen(target);
  }
  function back() {
    if ($('debug').className === 'debug') { $('debug').className = 'debug hidden'; return; }
    if (nowPlaying) { nowPlaying = false; zone = 'content'; navIndex = section; render(); return; }
    if (collecting) { cancel(); zone = 'content'; text('notice',''); render(); return; }
    if (zone === 'shuffle') { zone = 'content'; render(); return; }
    if (indexing) { cancel(); zone = 'letters'; render(); return; }
    if (zone === 'letters') { cancel(); zone = 'nav'; navIndex = section; render(); return; }
    if (busy && screen && screen.autoPlay) {
      cancel(); retry = function () { fetchScreen(screen); }; text('notice', 'Mix cancelled. Press OK to try again.');
    }
    if (stack.length) { cancel(); screen = stack.pop(); zone = 'content'; render(true); }
    else { zone = 'nav'; navIndex = section; render(); }
  }
  function move(code) {
    var step, next;
    if (zone === 'shuffle') { if (code === 40) { zone = 'content'; } else if (code === 37) { zone = 'nav'; navIndex = section; } render(); return; }
    if (zone === 'letters') {
      if (code === 37 && letterFocus === 0) { zone = 'nav'; }
      else if (code === 37 || code === 39) { letterFocus = Math.max(0,Math.min(letters.length - 1,letterFocus + (code === 37 ? -1 : 1))); }
      else if (code === 40) { zone = 'content'; }
      render(); return;
    }
    if (zone === 'nav') {
      if (dock()) { if (code === 37 || code === 39) { navIndex = Math.max(0,Math.min(menus.length - 1,navIndex + (code === 37 ? -1 : 1))); } else if (code === 38) { zone = 'content'; } }
      else if (code === 38 || code === 40) { navIndex = Math.max(0, Math.min(menus.length - 1, navIndex + (code === 38 ? -1 : 1))); }
      else if (code === 39) { zone = 'content'; }
      render(); return;
    }
    if (nowPlaying) {
      if (code === 38 && control >= 4) { control = control === 4 ? 1 : 3; render(); return; }
      if (code === 40 && control < 4) { control = control < 2 ? 4 : 5; render(); return; }
      if (dock() && code === 40) { zone = 'nav'; navIndex = nowIndex; render(); return; }
      if (code === 37 && control === 0) { zone = 'nav'; navIndex = nowIndex; }
      else if (code === 37 || code === 39) { control = Math.max(0, Math.min(5, control + (code === 37 ? -1 : 1))); }
      render(); return;
    }
    if (hasLetters() && code === 38 && screen && (!screen.items.length || screen.focus % (screen.grid ? 8 : 7) < (screen.grid ? 4 : 1))) { zone = 'letters'; letterFocus = Math.max(0,letters.indexOf(screen.letter || 'All')); render(); return; }
    if (canShuffle() && code === 38 && (!screen.items.length || screen.focus % 7 === 0)) { zone = 'shuffle'; render(); return; }
    if (!screen || busy || retry) { if (code === 37) { zone = 'nav'; render(); } return; }
    if (code === 37 && (!screen.grid || screen.focus % 4 === 0)) { zone = 'nav'; navIndex = section; render(); return; }
    if (!screen.grid && code === 39) { return; }
    step = code === 38 ? -(screen.grid ? 4 : 1) : code === 40 ? (screen.grid ? 4 : 1) : code === 37 ? -1 : 1;
    next = screen.focus + step;
    if (screen.remote && (next < 0 || next >= screen.items.length)) { turnPage(next < 0 ? -1 : 1); return; }
    screen.focus = Math.max(0, Math.min(screen.items.length - 1, next)); render();
  }
  MusicPlayer.listen(function (state) {
    var track = state.track, percent = Math.min(100, state.duration ? state.time / state.duration * 100 : 0) + '%', ids, i;
    ArtworkView.update(state);
    if (typeof MusicPanel !== 'undefined') { MusicPanel.update(); }
    text('repeat-state',['','Repeat one','Repeat all'][state.repeat || 0]);
    if (typeof IdleFullscreen !== 'undefined') { IdleFullscreen.update(state,busy || collecting || SettingsPanel.isOpen() || MusicPanel.isOpen() || ArtworkView.isOpen() || (typeof DecoderBench !== 'undefined' && DecoderBench.isOpen()) || $('debug').className === 'debug'); }
    if (typeof ScreenAwake !== 'undefined') { ScreenAwake.update(state); }
    text('track-format', state.format || ''); text('mini-format', state.format || '');
    if (!track) { lastTrack = null; lastCover = null; text('mini-title','Nothing playing'); text('mini-artist','Choose music or add songs to your queue.'); text('track-title','Choose music'); text('track-artist','Play an album or playlist from your library.'); text('mini-state',''); text('playback-state',''); text('queue-control','Queue'); setToggle('Play'); text('playback-time','0:00 / 0:00'); $('cover').className = $('mini-cover').className = 'hidden'; $('cover').removeAttribute('src'); $('mini-cover').removeAttribute('src'); $('progress-fill').style.width = $('mini-progress').style.width = '0%'; return; }
    if (!track.radio && rememberedTrack !== track && state.time >= Math.min(30, (state.duration || track.duration || 60) / 2)) { TrackMix.remember(track); rememberedTrack = track; }
    if (lastTrack !== track) {
      lastTrack = track;
      text('mini-title', track.title || 'Untitled'); text('mini-artist', track.artist || track.album || '');
      text('track-title', track.title || 'Untitled'); text('track-artist', [track.artist,track.album].filter(function (value) { return !!value; }).join(' · '));
    }
    text('mini-state',state.state === 'Playing' ? '' : state.state); text('playback-state',state.state === 'Playing' ? (track.radio ? 'Live radio' : '') : state.state); text('queue-control','Queue · ' + (state.index + 1) + ' / ' + state.count);
    text('playback-time', track.radio ? 'LIVE STREAM' : clock(state.time) + ' / ' + clock(state.duration || track.duration));
    setToggle(state.state === 'Playing' || state.state === 'Buffering' || state.state === 'Loading' ? (track.radio ? 'Stop' : 'Pause') : 'Play');
    $('progress-fill').style.width = percent; $('mini-progress').style.width = percent;
    if (lastCover !== (track.coverArt || '')) {
      lastCover = track.coverArt || ''; ids = ['cover', 'mini-cover'];
      for (i = 0; i < ids.length; i++) {
        $(ids[i]).className = lastCover ? '' : 'hidden';
        $(ids[i]).onerror = function () { this.className = 'hidden'; };
        if (lastCover) { $(ids[i]).src = MusicAPI.url('getCoverArt', {id:lastCover, size:300}); } else { $(ids[i]).removeAttribute('src'); }
      }
    }
  });
  if (typeof MusicPanel !== 'undefined') { MusicPanel.onPlay(function () { nowPlaying = true; zone = 'content'; control = 1; render(); }); }
  document.addEventListener('keydown', function (event) {
    var code = event.keyCode, handled = true;
    if (typeof IdleFullscreen !== 'undefined') { IdleFullscreen.touch(); }
    if (typeof DecoderBench !== 'undefined' && DecoderBench.handle(event)) { event.preventDefault(); return; }
    if ((typeof MusicPanel !== 'undefined' && MusicPanel.handle(event)) || SettingsPanel.handle(event) || ArtworkView.handle(event)) { event.preventDefault(); return; }
    if (code === 403 && typeof MusicPanel !== 'undefined' && (nowPlaying || zone === 'content' && screen && screen.kind === 'tracks')) { var chosen = nowPlaying ? MusicPlayer.status().track : screen.items[screen.focus]; if (chosen) { MusicPanel.actions(chosen,nowPlaying ? MusicPlayer.status().index : -1); } }
    else if (code === 403) { $('debug').className = $('debug').className === 'debug hidden' ? 'debug' : 'debug hidden'; }
    else if (code === 10009 || code === 27 || code === 8) { back(); }
    else if ($('debug').className === 'debug') { if (code === 38 || code === 40) { $('debug-log').scrollTop += code === 38 ? -60 : 60; } else { handled = false; } }
    else if (code === 13) { enter(); }
    else if (code >= 37 && code <= 40) { move(code); }
    else if (code === 404 || code === 405) { if (!nowPlaying && zone === 'content') { turnPage(code === 404 ? -1 : 1); } }
    else if (code === 406) { nowPlaying = !nowPlaying; zone = 'content'; render(); }
    else if (code === 10252 || code === 32) { MusicPlayer.toggle(); }
    else if (code === 415) { MusicPlayer.play(); }
    else if (code === 19) { MusicPlayer.pause(); }
    else if (code === 413) { MusicPlayer.stop(); }
    else if (code === 10233) { MusicPlayer.next(); }
    else if (code === 10232) { MusicPlayer.previous(); }
    else { handled = false; }
    if (handled) { event.preventDefault(); }
  });
  var i, nav, icon, keys = ['ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue','MediaPlayPause','MediaPlay','MediaPause','MediaStop','MediaTrackNext','MediaTrackPrevious'];
  for (i = 0; i < menus.length; i++) {
    nav = document.createElement('div'); nav.className = 'nav-item'; icon = document.createElement('span'); icon.className = 'nav-icon drawn-icon'; icon.setAttribute('aria-hidden','true');
    icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icons[i] + '</svg>';
    nav.appendChild(icon); nav.appendChild(document.createTextNode(menus[i])); $('navigation').appendChild(nav);
  }
  if (window.tizen && tizen.tvinputdevice) { for (i = 0; i < keys.length; i++) { try { tizen.tvinputdevice.registerKey(keys[i]); } catch (error) { log('Unavailable key: ' + keys[i]); } } }
  if (MusicPlayer.restore) { MusicPlayer.restore(); }
  if (!SUBSONIC_CONFIG.url || !SUBSONIC_CONFIG.username || !SUBSONIC_CONFIG.token || !SUBSONIC_CONFIG.salt) { text('notice', 'Open Settings to connect your music server.'); openSection(settingsIndex); }
  else { openSection(0); if (dock()) { nowPlaying = true; render(); } }
}());
