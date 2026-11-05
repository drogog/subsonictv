/* Samsung TV AppCommon screensaver control, scoped to this visible app. */
var ScreenAwake = (function () {
  'use strict';
  var state = 'Stopped', desired = false, applied = null, pending = false, failed = null, generation = 0, timer = null, closing = false;
  var message = 'TV screensaver allowed', listener = function () {};
  function api() { try { return typeof webapis !== 'undefined' && webapis.appcommon; } catch (error) { return null; } }
  function wanted() {
    var mode = AppSettings.values.keepAwake || 0;
    return !closing && !document.hidden && (mode === 2 || mode === 1 && /^(Playing|Buffering|Loading)$/.test(state));
  }
  function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }
  function sync() {
    var common = api(), target, token, states;
    desired = wanted(); target = desired;
    if (pending || applied === target || failed === target) { return; }
    if (!common || !common.setScreenSaver || !common.AppCommonScreenSaverState) { failed = target; message = 'Screensaver control unavailable on this device'; listener(); return; }
    pending = true; token = ++generation; states = common.AppCommonScreenSaverState; message = target ? 'Requesting screen awake…' : 'Restoring TV screensaver…';
    function finish(error) {
      if (token !== generation) { return; }
      clearTimer(); pending = false;
      if (error) { failed = target; applied = null; message = 'Screensaver request failed (' + (error.name || 'Error') + ')'; }
      else { applied = target; failed = null; message = target ? 'Screensaver disabled while this app is active' : 'TV screensaver allowed'; }
      listener();
      if (wanted() !== target) { sync(); }
    }
    timer = setTimeout(function () { finish({name:'Timeout'}); },4000);
    try { common.setScreenSaver(target ? states.SCREEN_SAVER_OFF : states.SCREEN_SAVER_ON,function () { finish(null); },finish); }
    catch (error) { finish(error); }
  }
  function refresh() { failed = null; sync(); }
  function release() {
    if (closing) { return; }
    closing = true; generation++; clearTimer(); pending = false; applied = null; failed = null; sync();
  }
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pagehide',release);
  window.addEventListener('beforeunload',release);
  window.addEventListener('pageshow',function () { closing = false; applied = null; refresh(); });
  return {update:function (value) { state = value.state || 'Stopped'; sync(); },refresh:refresh,release:release,status:function () { return message; },listen:function (callback) { listener = callback; }};
}());
