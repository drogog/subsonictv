/* A bounded personal mix, not a full-library scan. */
var TrackMix = (function () {
  'use strict';
  var history = {}, limit = 200;
  var storageKey = 'subsonic-tv-history:' + SUBSONIC_CONFIG.url + ':' + SUBSONIC_CONFIG.username;
  try { history = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (error) { history = {}; }
  function remember(track) {
    var keys = [], key;
    if (!track || track.radio || !track.id) { return; }
    history['$' + track.id] = Date.now();
    for (key in history) { if (history.hasOwnProperty(key)) { keys.push(key); } }
    keys.sort(function (a, b) { return history[b] - history[a]; });
    while (keys.length > limit) { delete history[keys.pop()]; }
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch (error) { /* Playback also works without storage. */ }
  }
  function build(candidates, count) {
    var pool = [], seen = {}, artists = {}, result = [], now = Date.now(), i, item, played, weight;
    var total, threshold, chosen, key, artist;
    for (i = 0; i < candidates.length; i++) {
      item = candidates[i]; key = '$' + item.id;
      if (!item.id || item.isVideo || seen[key]) { continue; }
      seen[key] = true;
      played = Math.max(history[key] || 0, Date.parse(item.played || item.lastPlayed || '') || 0);
      weight = 1 + (item.starred ? 2 : 0) + Math.max(0, Math.min(5, Number(item.userRating) || 0)) / 2;
      weight += Math.min(1, Math.log(1 + Math.max(0, Number(item.playCount) || 0)) / 4);
      if (now - played < 86400000) { weight *= 0.08; }
      else if (now - played < 604800000) { weight *= 0.4; }
      pool.push({track:item, weight:weight, artist:'$' + (item.artistId || item.artist || item.id)});
    }
    while (pool.length && result.length < count) {
      total = 0;
      for (i = 0; i < pool.length; i++) { total += pool[i].weight / (1 + (artists[pool[i].artist] || 0) * 3); }
      threshold = Math.random() * total; chosen = pool.length - 1;
      for (i = 0; i < pool.length; i++) {
        threshold -= pool[i].weight / (1 + (artists[pool[i].artist] || 0) * 3);
        if (threshold <= 0) { chosen = i; break; }
      }
      item = pool.splice(chosen, 1)[0]; result.push(item.track); artist = item.artist;
      artists[artist] = (artists[artist] || 0) + 1;
    }
    return result;
  }
  return {build:build, remember:remember};
}());
