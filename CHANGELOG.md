# Changelog

## 0.18.2

- Reduce decoder wake-ups while sufficient audio is scheduled, with sleeps of up to 250 ms and a 2.5-second refill reserve.
- Restore 10 ms polling when the buffer runs low. After an underrun, retain that timing through pause and resume for the rest of the track.
- Clear accumulated buffer-duration rounding errors so M4A playback completes reliably.

## 0.18.1

- Update visible player fields and refresh covered views when returning from Settings or fullscreen.
- Keep the visible mini-player live in Classic and Midnight while skipping it in Lounge.
- Separate progress updates from track, format and queue updates.

## 0.18.0

- Add bounded M4A sample indexing and streaming for AAC and Apple Lossless, feeding the playback samples into reactive visualization.
- Decode AAC segments through Web Audio and Apple Lossless through an ES5 adaptation of FFmpeg's decoder, with attribution and LGPL license coverage.
- Start fresh track, album and artist mixes from queue and library song options. Prefer songs outside the previous upcoming queue while preserving current playback.
- Add generated mono/stereo Apple Lossless fixtures and regression checks for range handling, cancellation and reference PCM output.

## 0.17.0

- Separate server address, port and SSL controls, with complete-URL paste support.
- Up to eight saved servers, isolated connection tests, switching, editing and removal. Existing server settings migrate automatically.
- Add Ribbon, Halo and Dot Matrix visualizations, plus Colour Flow and Zoom Pulse effects.
- Replace accumulating framebuffer trails with a fixed geometry history so faded marks disappear completely.
- Reduce Settings redraws by reusing visible rows and unchanged labels.

## 0.16.0

- Add a compact Now Playing mix picker for track, album and artist seeds.
- Preserve the current audio stream while replacing upcoming songs with a bounded mix.
- Cancel pending mixes on Back, track changes and queue edits; reject late results.
- Label recommendation, genre and artist-library fallbacks in Queue.

## 0.15.4

- Fix the empty Track Mix list when returning from Now Playing with Back.
- Avoid repeated writes of unchanged playback labels.

Version 0.18.2 passes all 22 offline checks. Desktop AAC and Apple Lossless segment tests passed, including comparison of 16-bit mono and 24-bit stereo ALAC output with FFmpeg. In a simulated healthy playback window, adaptive polling scheduled 40 decoder timers over 10 seconds compared with 1,000 at the previous fixed interval. The signed widget was installed and launched on the development TV. Full playback and performance verification of these changes remains pending on the TV.
