# Renderer harness audio fixture — provenance

Internal RF-06D harness fixture only. Not a production asset, never under
`public/renderers/**`, and never referenced by renderer code.

| File | Location |
|---|---|
| `audio-tone.wav` | `public/internal/renderer-harness/audio-tone.wav` |

## Record

- **Source:** generated in this repository for the RF-06D renderer harness
  by a short deterministic integer algorithm. The same algorithm is kept in
  `__tests__/harness-audio-fixture.test.ts`, which regenerates the bytes and
  compares them with the committed file.
- **Content:** a plain triangle-wave tone (period 20 samples, about 400 Hz),
  low amplitude, with a linear fade-in and fade-out of 800 samples each.
  Not music.
- **Format:** RIFF/WAVE, PCM, 8-bit unsigned, mono, 8000 Hz, 16000 samples
  (2 seconds), 16044 bytes.
- **External sources:** none. No recording, sample, library sound or
  downloaded file was used, and nothing is fetched from the network.
- **Task 029 prototype:** not used.
- **Use:** only the `music-resolved` harness scenario resolves the fixture
  audio slot to this file, so the real RF-06C music capability and the
  RF-06D music control can be exercised. Every other scenario keeps the
  audio `UNAVAILABLE`.
