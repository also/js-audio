js-audio
========

js-audio contains some helpers for working with audio files in JavaScript. *These are mostly experiments or proof-of-concepts.*

mp3.js
------

mp3.js parses (not decodes) MP3. This allows you to split MP3 files on logical frames.

id3.js
------

id3.js reads ID3 tags from MP3 files, including album artwork.

wave.js
-------

wave.js extracts chunks of wave files as AudioBuffers, and generates wave files (blobs). For reading wave files, David Lindkvist’s [wav.js][1] looks better.

[1]: https://github.com/ffdead/wav.js
