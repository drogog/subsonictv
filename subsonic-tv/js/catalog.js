var MusicCatalog = (function () {
  'use strict';
  function params(count,offset) { return {query:'',artistCount:0,albumCount:0,songCount:count,songOffset:offset}; }
  function songs(data) { return data.searchResult3 && data.searchResult3.song || []; }
  function shuffle(items) {
    var result = [], seen = {}, i, j, swap, item;
    for (i = 0; i < items.length; i++) { item = items[i]; if (item.id && !item.isVideo && !seen['$' + item.id]) { seen['$' + item.id] = true; result.push(item); } }
    for (i = result.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); swap = result[i]; result[i] = result[j]; result[j] = swap; }
    return result;
  }
  function all(done,progress) {
    var cancelled = false, request = null, offset = 0, result = [], seen = {};
    function batch() {
      if (cancelled) { return; }
      if (progress) { progress(result.length); }
      request = MusicAPI.request('search3',params(500,offset),function (error,data) {
        var items, i, t, added = 0, copy, k, fields = ['id','title','artist','album','coverArt','suffix','duration','bitRate','samplingRate','bitDepth','genre','starred','replayGain'];
        if (cancelled) { return; }
        if (error) { done(error); return; }
        items = songs(data);
        for (i = 0; i < items.length; i++) { t = items[i]; if (!seen['$' + t.id]) { seen['$' + t.id] = true; added++; if (t.id && !t.isVideo) { copy = {}; for (k = 0; k < fields.length; k++) { if (t[fields[k]] !== undefined) { copy[fields[k]] = t[fields[k]]; } } result.push(copy); } } }
        if (items.length && !added) { done('Server repeated a song page.'); return; }
        offset += items.length;
        if (items.length === 500) { batch(); } else { done(null,result); result = []; }
      });
    }
    batch(); return {cancel:function () { cancelled = true; if (request) { request.cancel(); } result = []; }};
  }
  return {params:params,songs:songs,shuffle:shuffle,all:all};
}());
