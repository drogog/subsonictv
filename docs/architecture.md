# Architecture and storage

The widget uses ES5 JavaScript and a fixed 1280×720 layout scaled to the display. Only eight album tiles or seven list rows are rendered at a time. Focus changes reuse visible rows and artwork.

## Main modules

| File | Responsibility |
| --- | --- |
| `js/api.js` | Token-authenticated Subsonic requests, timeouts and cancellation |
| `js/app.js` | Remote input, navigation, paged screens and player presentation |
| `js/player.js` | Queue, repeat, fades and playback-engine selection |
| `js/stream-audio.js` | Audio-element-like adapter around the incremental decoder |
| `js/stream-decoder.js` | Bounded HTTP ranges, compressed-buffer disposal, PCM scheduling and Web Audio analysis |
| `js/listening.js` | Compact queue persistence, ReplayGain and idle fullscreen |
| `js/music-panel.js` | Search, favourites, queue editing and song actions |
| `js/catalog.js`, `js/mix.js` | Full-library metadata collection and weighted mixes |
| `js/artwork.js`, `js/visualizer.js`, `js/turntable.js` | Fullscreen artwork, canvas styles and LP animation |
| `js/settings-store.js`, `js/settings-ui.js` | Validated preferences, account setup and remote keyboard |
| `js/screen-awake.js` | Foreground Samsung screensaver policy |

Paths above are relative to `subsonic-tv/`. `native-audio.js` retains the earlier compatibility adapter; original MP3/FLAC normally use the incremental engine rather than the unreliable legacy media-element analysis bridge.

## Audio path

```text
64 KiB HTTP ranges → Audiocogs demuxer/decoder → short PCM queue
                  → Web Audio buffer sources → analyser → gain → speakers
```

The range source requires HTTP 206 and rejects whole-file HTTP 200 responses. Consumed compressed buffers have both forward and backward links released. Roughly three seconds of PCM are kept ahead; pause preserves the buffered tail and stops further requests after an in-flight request. Decoding and visualization share the playing stream. No second analysis download is started.

The canvas uses 640×360 backing pixels and a roughly 60 FPS draw cap. Measured performance depends on the TV and track. Rendering stops when paused, hidden or closed. The LP uses a CSS rotation and updates tonearm position from normal player progress events. Idle fullscreen uses existing playback updates.

## Data retained

- Server URL, username, token and salt, and appearance/playback preferences: TV localStorage.
- Session restore: at most 500 compact library track entries, scoped by server and username, written when the queue/current entry changes. No song bytes or stream URLs are persisted in the session snapshot.
- Track Mix history: up to 200 track records, scoped by server and username.
- Album letter index, library pages and active queue: RAM for the running session.
- Audio: bounded compressed/PCM buffers in RAM. The application does not write audio files. Browser or firmware HTTP caching is outside this guarantee.

Favourites are read and changed through the music server. Playback does not write ratings or scrobbles. There is no application analytics or diagnostic upload in normal startup. The interactive decoder benchmark runs locally and must be started explicitly.
