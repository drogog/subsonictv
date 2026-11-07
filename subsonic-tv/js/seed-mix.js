/* Metadata-only mixes: at most 200 candidates, 50 results and 12 requests. */
var SeedMix = (function () {
  'use strict';
  function metadata(track, detail) {
    var copy = {}, key;
    for (key in track) { if (track.hasOwnProperty(key)) { copy[key] = track[key]; } }
    for (key in detail) { if (detail.hasOwnProperty(key) && detail[key] !== undefined) { copy[key] = detail[key]; } }
    if (!copy.artistId && copy.artists && copy.artists.length) { copy.artistId = copy.artists[0].id; }
    return copy;
  }
  function genres(track) {
    var result = [], seen = {}, values = track.genres || [], i, value;
    if (track.genre) { values = [track.genre].concat(values); }
    for (i = 0; i < values.length && result.length < 3; i++) {
      value = typeof values[i] === 'string' ? values[i] : values[i].name || values[i].value;
      if (value && !seen['$' + value]) { seen['$' + value] = true; result.push(value); }
    }
    return result;
  }
  function unavailable(track, kind) {
    if (!track || !track.id || track.radio) { return 'Choose a library song first.'; }
    if (kind === 'album' && !track.albumId) { return 'This song has no album ID.'; }
    if (kind === 'artist' && !track.artistId) { return 'This song has no artist ID.'; }
    return '';
  }
  function build(original, kind, done) {
    var seed = metadata(original,{}), pool = [], seen = {}, request = null, finished = false, calls = 0;
    var method = '', partial = false, album = null, timer;
    function cancel() { finished = true; clearTimeout(timer); if (request) { request.cancel(); request = null; } pool = []; }
    function finish(error) {
      if (finished) { return; }
      var tracks = kind === 'artist' ? MusicCatalog.shuffle(pool).slice(0,50) : TrackMix.build(pool,50);
      var name = kind === 'album' ? seed.album : kind === 'artist' ? seed.artist : seed.title;
      var result = {tracks:tracks,label:(kind === 'album' ? 'Album mix' : kind === 'artist' ? 'Artist mix' : 'Track mix') + ' · ' + (name || 'Untitled'),method:method,partial:partial};
      cancel(); done(error || (tracks.length ? null : 'No other songs found for this mix.'),result);
    }
    function ask(endpoint, params, next) {
      if (finished) { return; }
      if (calls >= 12) { partial = true; finish(); return; }
      calls++;
      var completed = false, handle = MusicAPI.request(endpoint,params,function (error,data) {
        completed = true; if (finished) { return; } request = null; next(error,data || {});
      });
      if (!completed) { request = handle; }
    }
    function add(songs, artistOnly) {
      var i, t;
      for (i = 0; i < songs.length && pool.length < 200; i++) {
        t = songs[i];
        if (!t || !t.id || t.id === seed.id || t.isVideo || t.radio || seen['$' + t.id]) { continue; }
        // IDs, not display names, determine artist membership (including compilations).
        if (artistOnly && t.artistId !== seed.artistId && !(t.artists || []).some(function (a) { return a.id === seed.artistId; })) { continue; }
        seen['$' + t.id] = true; pool.push(t);
      }
      if (i < songs.length) { partial = true; }
    }
    function artistSongs() {
      if (!seed.artistId) { finish('No recommendations or usable genre/artist tags for this song.'); return; }
      method = kind === 'artist' ? 'Artist library' : 'Artist library fallback';
      ask('getArtist',{id:seed.artistId},function (error,data) {
        if (error) { finish(error); return; }
        var albums = MusicCatalog.shuffle(data.artist && data.artist.album || []).slice(0,8), at = 0;
        partial = (data.artist && data.artist.album || []).length > albums.length;
        function next() {
          if (pool.length >= 200 || at >= albums.length) { if (at < albums.length) { partial = true; } finish(); return; }
          ask('getAlbum',{id:albums[at++].id},function (err,body) {
            if (err) { finish(err); return; }
            add(MusicCatalog.shuffle(body.album && body.album.song || []),true); next();
          });
        }
        next();
      });
    }
    function tagged() {
      var tags = genres(album || seed), at = 0;
      if (!tags.length && album) {
        var songs = album.song || [], i;
        for (i = 0; i < songs.length && tags.length < 3; i++) { tags = genres({genres:tags.concat(genres(songs[i]))}); }
      }
      if (!tags.length) { if (album) { related(); } else { artistSongs(); } return; }
      method = 'Genre tags · ' + tags.join(', ');
      function next() {
        if (at >= tags.length || pool.length >= 200) { if (pool.length) { finish(); } else { artistSongs(); } return; }
        ask('getRandomSongs',{genre:tags[at++],size:Math.floor(200 / tags.length)},function (error,data) {
          if (error) { finish(error); return; }
          add(data.randomSongs && data.randomSongs.song || []); next();
        });
      }
      next();
    }
    function related() {
      // Song IDs work on Navidrome; artist IDs support standard Subsonic servers.
      var id = kind === 'album' ? (album.artistId || seed.artistId) : seed.id;
      if (!id) { if (album) { artistSongs(); } else { tagged(); } return; }
      ask('getSimilarSongs2',{id:id,count:200},function (error,data) {
        if (!error) { add(data.similarSongs2 && data.similarSongs2.song || []); }
        if (pool.length) { method = 'Server recommendations'; finish(); return; }
        if (kind === 'track' && seed.artistId && seed.artistId !== id) {
          ask('getSimilarSongs2',{id:seed.artistId,count:200},function (err,body) {
            if (!err) { add(body.similarSongs2 && body.similarSongs2.song || []); }
            if (pool.length) { method = 'Related artists'; finish(); } else { tagged(); }
          });
        } else if (album) { artistSongs(); } else { tagged(); }
      });
    }
    function start() {
      var reason = unavailable(seed,kind);
      if (reason) { finish(reason); return; }
      if (kind === 'artist') { artistSongs(); }
      else if (kind === 'album') {
        ask('getAlbum',{id:seed.albumId},function (error,data) {
          if (error || !data.album) { finish(error || 'Album metadata unavailable.'); return; }
          album = data.album; seed.album = album.name || seed.album;
          // Album mixes favour album tags, including genres on its songs.
          tagged();
        });
      } else { related(); }
    }
    timer = setTimeout(function () { finish('Mix request timed out. Try again.'); },30000);
    if (['track','album','artist'].indexOf(kind) < 0) { finish('Unknown mix type.'); }
    else if (!seed.id || seed.radio) { finish('Choose a library song first.'); }
    else if (!seed.artistId || !seed.albumId || !genres(seed).length) {
      ask('getSong',{id:seed.id},function (error,data) { if (!error && data.song && data.song.id === seed.id) { seed = metadata(seed,data.song); } start(); });
    } else { start(); }
    return {cancel:cancel};
  }
  return {build:build,metadata:metadata,unavailable:unavailable};
}());
