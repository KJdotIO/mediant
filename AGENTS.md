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

## Layout

- `packages/theory`: the theory engine, `@mediant/theory`. No UI code and no dependencies.
  - `identify(midiNotes, { key })` returns a note, interval, chord or cluster reading.
  - Chord readings carry the symbol, the spelling and degree of each note, a Roman numeral when a key is set, and close alternative readings.
  - Readings are ranked by penalty in `src/identify.ts`. A root that isn't the bass costs `SLASH_PENALTY`.
  - Symbols are ASCII (`b`, `#`). `formatSymbol` converts them to ♭ and ♯ for display.
  - Roman numerals use the major scale as the reference in every key, so C in A minor is `bIII`.

## Tests

- Fixtures in `packages/theory/test/identify.test.ts` are voicings with the name a musician would expect.
- Add a fixture before you change the scoring. Check that the other fixtures still pass.

## Plan

1. Theory engine and tests.
2. Debug page that connects a MIDI keyboard through Web MIDI and prints readings. Check latency, the sustain pedal (CC64) and stuck notes.
3. Design in Figma from real engine output. Direction: dark, glowing notes on the circle of fifths, warm and tactile in the style of Spitfire Audio.
4. Web app (Vite, React), then a Mac app with Tauri. WKWebView has no Web MIDI, so the Mac app reads MIDI in Rust with `midir`.
5. Deterministic next-chord suggestions ranked by voice-leading distance from the held voicing.
