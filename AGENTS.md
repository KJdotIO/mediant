# Mediant

Open-source (MIT) app that shows what you play on a MIDI keyboard: chord name, keyboard, grand staff and circle of fifths. pnpm workspace, TypeScript.

## Run pnpm

Corepack and a global pnpm are not installed. Prefix every pnpm call:

```sh
npx -y pnpm@11.5.3 install
npx -y pnpm@11.5.3 test
npx -y pnpm@11.5.3 typecheck
```

Run Vitest through pnpm, for example `npx -y pnpm@11.5.3 exec vitest run` in `packages/theory`. A bare `npx vitest` downloads a different version.

Web app:

```sh
npx -y pnpm@11.5.3 --filter @mediant/web dev     # http://localhost:5178
npx -y pnpm@11.5.3 --filter @mediant/web build
```

## Layout

- `apps/web`: Vite and React app. Web MIDI input, computer-key fallback, circle of fifths, grand staff (VexFlow, `vexflow/bravura` bundles the font), 88-key keyboard.
  - `src/notes.ts`: `NoteTracker` holds sounding notes, including notes held by the sustain pedal (CC64). `useMidi` and `useComputerKeys` feed it. Tested in `src/notes.test.ts`.
  - Settings persist in `localStorage` under `mediant.settings`: hold last chord, key labels, middle C (C3 or C4) and the key.
  - `src/logic.ts` holds the pure UI logic, tested in `src/logic.test.ts`: which chord to hold after an uneven release, note grouping past 8 notes, octave markings on the staff.
  - In dev builds, `window.mediantTracker` exposes the tracker so browser tests can play any notes, and `window.mediantAudio` exposes the audio context.
  - `src/audio/`: one shared `AudioContext` (resumed on the first click or key press), the sampled `Piano`, and a `Metronome` scheduled on the audio clock. Tested in `src/audio/audio.test.ts`.
  - `src/recording/`: takes. `take.ts` holds the pure parts (trim, `TakeCursor`, MIDI writer), tested in `take.test.ts`. `recorder.ts` records and plays takes through the tracker; with the metronome on, it restarts the click, counts in one bar and keeps the take on the bar lines. `store.ts` keeps takes in IndexedDB. `frame.ts` draws video frames on a canvas (16:9 and 9:16), and `video.ts` renders the piano offline and encodes MP4 with Mediabunny.
  - To check an exported video, sample frames after seeking and wait two animation frames before drawing; reading straight after `seeked` can return a stale frame.
  - Ego Lite throttles animation frames to a few per second, so judge the beat lights with the `beatAt` tests, not by eye in that browser.

## Sound packs

- `node scripts/build-sounds.mjs [felt|upright|grand]` rebuilds `apps/web/public/sounds/<id>/`: AAC samples, `manifest.json` and `LICENSE.txt`.
- Sources are the CC0 and public-domain sets prepared at `huggingface.co/datasets/cueharbor/starter-instruments`. Downloads are cached in `.cache/sounds` (git-ignored).
- Encoding uses macOS `afconvert` at 96 kbps. AAC priming is trimmed by the browser: decoded samples start within 4 ms.
- The Homebrew `ffmpeg` on this machine fails to load `libx265`, so the script doesn't use it.
- `packages/theory`: the theory engine, `@mediant/theory`. No UI code and no dependencies.
  - `identify(midiNotes, { key })` returns a note, interval, chord or cluster reading.
  - Chord readings carry the symbol, the spelling and degree of each note, a Roman numeral when a key is set, and close alternative readings.
  - Readings are ranked by penalty in `src/identify.ts`. A root that isn't the bass costs `SLASH_PENALTY`.
  - Symbols are ASCII (`b`, `#`). `formatSymbol` converts them to ♭ and ♯ for display.
  - Roman numerals use the major scale as the reference in every key, so C in A minor is `bIII`.

## Tests

- Fixtures in `packages/theory/test/identify.test.ts` are voicings with the name a musician would expect.
- Add a fixture before you change the scoring. Check that the other fixtures still pass.
- Add a fixture only when it runs a code path no other fixture covers. The same chord on another root or in another octave adds nothing.

## UI rules

- Nothing moves when notes change. Reserve space for every state: empty, one note, many notes, held chord, pedal down. Check panel rects across states in a browser before you commit.
- The keyboard always shows all 88 keys.
- Note on and off update instantly, with no transitions. Motion is for infrequent moments only, such as the first-load entrance. Gate movement behind `prefers-reduced-motion: no-preference`.
- Display-only text can't be selected (`user-select: none` on `.app`).
- Pressed buttons scale to `0.96` over `150ms` `ease-out`. Hover styles sit inside `@media (hover: hover)`.
- Visual direction: Splice INSTRUMENT. Charcoal panels with a large radius, wide uppercase labels (Archivo at `font-stretch: 125%`), orange for the root, cream for other chord tones.
- Design skills: the local `better-*` skills and https://github.com/emilkowalski/skills.

## Plan

1. Theory engine and tests.
2. Debug page that connects a MIDI keyboard through Web MIDI and prints readings. Check latency, the sustain pedal (CC64) and stuck notes.
3. Design in Figma from real engine output. Direction: dark, glowing notes on the circle of fifths, warm and tactile in the style of Spitfire Audio.
4. Web app (Vite, React), then a Mac app with Tauri. WKWebView has no Web MIDI, so the Mac app reads MIDI in Rust with `midir`.
5. Deterministic next-chord suggestions ranked by voice-leading distance from the held voicing.
