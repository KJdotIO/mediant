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
  - Settings persist in `localStorage` under `mediant.settings`: hold last chord, key labels, middle C (C3 or C4), the key and the MIDI input.
  - `useMidi` listens to the MIDI input chosen in **Settings**, or to every input when none is chosen. The picker shows when two or more inputs are connected.
  - The snapshot's `harmony` holds the notes that count towards the chord name, and `notes` holds everything that sounds. With the pedal down, a chord (three or more different notes down within 100 ms) replaces the earlier notes the pedal holds. A bass note struck just before the chord stays, and so do keys still down. The keyboard draws the rest in grey.
  - `TakeCursor` passes each event's own time to the tracker, so videos group notes the same way every time.
  - `NoteTracker` passes each listener the time the event happened. MIDI events use the message's own `timeStamp`.
  - `src/wakeLock.ts` keeps the screen awake for five minutes after the last note.
  - `src/Next.tsx` shows the suggestions with no clicks needed. They follow the last chord that sounded unchanged for `SETTLE_MS` (400 ms), so fast playing leaves them as they were. Dots on the keyboard and a dashed shape on the circle show the first one while nothing is held or the chord is still held. A card lights orange when you play it. **Settings** has an on/off switch and **Voicing**.
  - `src/logic.ts` holds the pure UI logic, tested in `src/logic.test.ts`: which chord to hold after an uneven release, note grouping past 8 notes, octave markings on the staff.
  - In dev builds, `window.mediantTracker` exposes the tracker so browser tests can play any notes, and `window.mediantAudio` exposes the audio context.
  - `src/audio/`: one shared `AudioContext` (resumed on the first click or key press), the sampled `Piano`, and a `Metronome` scheduled on the audio clock. Tested in `src/audio/audio.test.ts`.
  - `src/recording/`: takes. `take.ts` holds the pure parts (trim, `TakeCursor`, MIDI writer), tested in `take.test.ts`. `recorder.ts` records and plays takes through the tracker; with the metronome on, it restarts the click and counts in one bar, and `trimTake` starts the take on the bar line where you come in. `store.ts` keeps takes in IndexedDB. `frame.ts` draws video frames on a canvas (16:9 and 9:16), and `video.ts` renders the piano offline and encodes MP4 with Mediabunny.
  - Browser tests on localhost share the user's `localStorage` and IndexedDB. Restore any setting a test changes, such as `audioInput`, before finishing.
  - `fitTitle` in `take.ts` lays a video title out in up to two lines: one line, then two balanced lines, then smaller, then an ellipsis. In 16:9 a two-line title raises the logo block by `lift` so it clears the circle.
  - A take can have a `name`, edited in place in the takes list. Videos show it under the logo, files and the MIDI track use it, and the key and tempo sit in the corner of the staff panel.
  - Test one download in each browser run. A second download started from `page.evaluate` makes Chrome ask about multiple downloads, and Ego Lite hands the tab to the user.
  - To check video frames without an export, import `/src/recording/frame.ts` in the page, draw with `FrameRenderer` on a canvas, and save `toDataURL()`.
  - After a test deletes a take, wait until IndexedDB no longer has it before you reload. A reload straight after the click cancels the delete.
  - To test MIDI without a keyboard, replace `navigator.requestMIDIAccess` with `Page.addScriptToEvaluateOnNewDocument` before the page loads, and call `onmidimessage` on the fake inputs.
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
  - Readings with the same penalty are split by the root in the bass, then the plainer chord, then the bass's place in the chord. The pitch never splits a tie, so a shape reads the same in every key.
  - A bass that is only an extension of the chord above it, and isn't doubled, stays out of the name: F, A and C over G is `F/G`, not `Fadd9/G`.
  - A slash-chord bass takes its simplest name (`Db7/B`), unless the key spells it another way.
  - In a key, `keyRoot` in `src/key.ts` spells roots outside the scale: raised for diminished chords (`B#dim7` in C# minor), lowered for borrowed chords (`bII`, `bVI`).
  - Symbols are ASCII (`b`, `#`). `formatSymbol` converts them to ♭ and ♯ for display.
  - Roman numerals use the major scale as the reference in every key, so C in A minor is `bIII`.
  - `suggest(midiNotes, { key, voicing })` in `src/suggest.ts` returns up to three next chords. Candidates come from the key (or a key guessed from the chord: m7 as ii, 7 as V): diatonic chords, secondary dominants, tritone subs and chords borrowed from the parallel minor.
  - Each candidate is voiced from the played notes without crossing voices, then ranked by movement plus `FUNCTION_WEIGHT` times its function cost. A voicing must read with `identify` as the chord it was built for.
  - Voicing styles: `closest` (inversions allowed, the bass can step to the third), `root` (root in the bass) and `rich` (root plus a rootless A or B form, with b9 and b13 on dominants that resolve to a minor chord).
  - Fixtures are in `test/suggest.test.ts`. The properties test checks that suggestions move the same way in all 12 keys.

## Tests

- Fixtures in `packages/theory/test/identify.test.ts` are voicings with the name a musician would expect.
- Add a fixture before you change the scoring. Check that the other fixtures still pass.
- Add a fixture only when it runs a code path no other fixture covers. The same chord on another root or in another octave adds nothing.
- `packages/theory/test/properties.test.ts` checks rules that hold for every set of notes, with fast-check: the same reading in all 12 keys, and note names that match the keys pressed.

## UI rules

- Nothing moves when notes change. Reserve space for every state: empty, one note, many notes, held chord, pedal down. Check panel rects across states in a browser before you commit.
- The keyboard always shows all 88 keys.
- Note on and off update instantly, with no transitions. Motion is for infrequent moments only, such as the first-load entrance. Gate movement behind `prefers-reduced-motion: no-preference`.
- Display-only text can't be selected (`user-select: none` on `.app`).
- Pressed buttons scale to `0.96` over `150ms` `ease-out`. Hover styles sit inside `@media (hover: hover)`.
- Visual direction: Splice INSTRUMENT. Charcoal panels with a large radius, wide uppercase labels (Archivo at `font-stretch: 125%`), orange for the root, cream for other chord tones.
- Motion tokens live in `:root`: `--enter` (220ms, `--ease-out`) and `--leave` (140ms, `--ease-leave`). Things leave faster than they arrive. Blur fades start at 4px and end at 0, and exits only reach 2px. Patterns come from `interior` (MIT, https://github.com/ddoemonn/interior), rewritten in CSS. Don't add `motion`.
- A tooltip is one short sentence on hover (after 400 ms) or keyboard focus, and never holds anything you act on. Anything longer, with a picture or with steps, goes in an info pane. `Setting`, `Info` and `Switch` in `src/Tip.tsx` build both. Both use the popover top layer, so the settings column never clips them.
- Esc closes a tooltip or info pane first, and only then Settings.
- Ego Lite runs CSS transitions a few frames at a time, so check end states after a second or two, or emulate `prefers-reduced-motion: reduce`.
- Design skills: the local `better-*` skills and https://github.com/emilkowalski/skills.

## Plan

1. Theory engine and tests.
2. Debug page that connects a MIDI keyboard through Web MIDI and prints readings. Check latency, the sustain pedal (CC64) and stuck notes.
3. Design in Figma from real engine output. Direction: dark, glowing notes on the circle of fifths, warm and tactile in the style of Spitfire Audio.
4. Web app (Vite, React), then a Mac app with Tauri. WKWebView has no Web MIDI, so the Mac app reads MIDI in Rust with `midir`.
5. Deterministic next-chord suggestions ranked by voice-leading distance from the held voicing.
