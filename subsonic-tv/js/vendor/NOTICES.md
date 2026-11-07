# Bundled decoder dependencies

Aurora.js v0.4.4 (MIT), MP3.js v0.1.0 (GPL-2.0), and FLAC.js v0.2.1 (LGPL-2.1-or-later), from Audiocogs:

- https://github.com/audiocogs/aurora.js/releases/tag/v0.4.4
- https://github.com/audiocogs/mp3.js/releases/tag/v0.1.0
- https://github.com/audiocogs/flac.js/releases/tag/v0.2.1

The unminified published browser bundles are included here. Local modification: `const` declarations in the MP3 and FLAC bundles were converted to `var` on 2026-11-04 for the ES5 TV engine. No decoding algorithm changes. Upstream notices and license texts accompany the bundles. The bundled MP3 decoder is GPL-2.0. Its license text is included in COPYING-GPL-2.0.txt; FLAC’s license is in COPYING-LGPL-2.1.txt and Aurora’s is in MIT.txt. Preserve these notices with redistributed source and builds.

Additional local change on 2026-11-04: the FLAC demuxer preserves incomplete metadata headers/bodies across range boundaries and waits for the final metadata body before emitting audio data. The application uses its own bounded range transport and PCM scheduler, not Aurora's default HTTP source/player or decodeToBuffer. Those defaults can retain an entire file.

The widget includes an ES5 mono/stereo adaptation in `js/alac-packet.js` of [FFmpeg n7.1's ALAC decoder](https://github.com/FFmpeg/FFmpeg/blob/n7.1/libavcodec/alac.c), copyright (c) 2005 David Hammerton and FFmpeg contributors. This adaptation is distributed under LGPL-2.1-or-later. See COPYING-LGPL-2.1.txt.
