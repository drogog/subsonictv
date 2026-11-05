# Now Playing mixes

Implemented in v0.16.0. On-device playback and responsiveness still need user verification.

Open **Now Playing → Song options → Start mix**, or press Red on Now Playing and choose **Start mix**. The compact picker leaves the cover and transport visible. Up/Down selects a seed; OK builds the mix; Back cancels and restores the previous focus.

| Choice | Behaviour |
| --- | --- |
| Track mix | Tries server song recommendations, then artist recommendations. If unavailable or empty, uses the song’s genre tags, then the artist’s library. |
| Album mix | Uses up to three album genres (or genres from its songs); without tags, tries artist recommendations, then the artist’s library. It does not simply shuffle the album. |
| Artist mix | Shuffles songs belonging to the current song’s artist by ID, including credited collaborations. |

Track and album mixes reuse the existing recent-listening and preference weighting. Artist mixes use an unweighted shuffle. The resulting Queue identifies the seed and the method used. Genre-based results are labelled as genre tags, never acoustic similarity.

## Playback and cancellation

The current song keeps its decoder, PCM buffers, playback position and pause state. Only upcoming entries are replaced, with up to 50 unique songs excluding the current song. Earlier queue entries remain available through Previous. The queue is persisted once after replacement; its mix label is session-only and clears on manual edits or a new queue.

Back cancels an in-flight request. Track changes, restarts, Stop and queue edits invalidate pending results. Failed or empty results leave the queue unchanged. Repeated OK presses do not start additional requests. Radio has no seed-mix action. Missing album/artist IDs are resolved from song metadata when possible; unavailable choices explain why they cannot run.

## Limits and compatibility

- At most 200 unique candidate songs, 50 output songs, 12 metadata requests and 30 seconds per operation.
- Artist collection visits up to eight randomly chosen albums, rather than scanning the library. Large collections are labelled as a limited sample. Membership uses artist IDs, not matching display names.
- Three genre tags at most; bounded random-song requests per genre. Server responses may contain larger album metadata, but only the bounded candidate pool is retained.
- Metadata only: no additional audio stream, file download or persisted audio. Existing library-wide Track Mix settings remain independent.
- [Standard Subsonic](https://www.subsonic.org/pages/api.jsp#getSimilarSongs2) documents artist-based recommendations. [Navidrome’s implementation](https://github.com/navidrome/navidrome/blob/master/server/subsonic/browsing.go) delegates recommendation lookup to its configured provider. Unsupported/empty recommendation responses trigger the documented fallback; no external recommendation account is required for tag/library mixes.

## Verification and follow-up

Offline checks cover recommendation fallback, album tags, strict artist matching, missing IDs, small libraries, duplicates, request/result limits, timeout/cancellation, remote focus, radio exclusion and stale queue/track responses. Player checks verify one persistence update and no playback restart, including the incremental MP3/FLAC adapter.

On the target TV, verify each choice with MP3 and FLAC, cancel during loading, and skip while a request is pending. Check responsiveness and decoder underruns before claiming a measured performance improvement. Possible later extensions: a separate related-artists choice and a server-supported paged artist-song lookup for broader sampling.
