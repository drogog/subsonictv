var TurntableView = (function () {
  'use strict';
  var active = false, cover = null;
  function $(id) { return document.getElementById(id); }
  function time(value) { value = Math.max(0,Math.floor(value || 0)); return Math.floor(value / 60) + ':' + (value % 60 < 10 ? '0' : '') + value % 60; }
  function update(state) {
    if (!active) { return; }
    state = state || {}; var track = state.track || {}, id = track.coverArt || '', duration = state.duration || track.duration || 0;
    var progress = !track.radio && duration > 0 ? Math.max(0,Math.min(1,(state.time || 0) / duration)) : 0;
    var rotation = 'rotate(' + (20 + progress * 22).toFixed(2) + 'deg)';
    $('lp-arm').style.webkitTransform = rotation; $('lp-arm').style.transform = rotation;
    $('lp-disc').style.webkitAnimationPlayState = $('lp-disc').style.animationPlayState = state.state === 'Playing' && !document.hidden ? 'running' : 'paused';
    $('lp-time').textContent = track.radio ? 'LIVE RADIO' : time(state.time) + ' / ' + time(duration);
    $('lp-position').textContent = track.radio || !duration ? 'POSITION UNAVAILABLE' : Math.round(progress * 100) + '% PLAYED';
    if (id !== cover) { cover = id; $('lp-cover').className = id ? '' : 'hidden'; $('lp-cover').onerror = function () { this.className = 'hidden'; }; if (id) { $('lp-cover').src = MusicAPI.url('getCoverArt',{id:id,size:200}); } else { $('lp-cover').removeAttribute('src'); } }
  }
  function close() { active = false; $('turntable').className = 'hidden'; $('lp-disc').style.webkitAnimationPlayState = $('lp-disc').style.animationPlayState = 'paused'; $('lp-cover').removeAttribute('src'); cover = null; }
  return {open:function (state) { active = true; $('turntable').className = 'turntable'; update(state); },update:update,close:close,suspend:function () { $('lp-disc').style.webkitAnimationPlayState = $('lp-disc').style.animationPlayState = 'paused'; }};
}());
