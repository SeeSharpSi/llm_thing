# Herdr completion sound

`herdr_done.pcm` is the completion notification from Herdr v0.9.3, converted
for Pebble's Speaker API. It contains 1.08 seconds of signed, little-endian,
16-bit mono PCM at 16 kHz, without a file header.

Source: <https://github.com/herdrdev/herdr/blob/v0.9.3/assets/sounds/done.mp3>

Herdr contributors distribute the repository under Apache-2.0. A copy of the
upstream license is included in `LICENSE.herdr`. The conversion changes the
encoding, sample rate, and channel count of the original recording.

## Reproduce the conversion

Run from the repository root:

```sh
ffmpeg \
  -i https://raw.githubusercontent.com/herdrdev/herdr/v0.9.3/assets/sounds/done.mp3 \
  -ac 1 -ar 16000 -c:a pcm_s16le -f s16le \
  resources/audio/herdr_done.pcm
```

SHA-256 of the source MP3:
`cb9c93492c808e33946edac2ab5915758267e65914bc4b794a5ca6dc6e655741`.

SHA-256 of the converted PCM:
`e541e868c631482314fbed4b50f10c3ea5475472eaa912821815817bb27004a4`.
