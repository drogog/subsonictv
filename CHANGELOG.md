# Changelog

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

The current release passes 21 offline checks. Packages have been installed and launched on the development TV; full playback and performance verification of the latest features remains a device test.
