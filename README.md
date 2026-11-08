<p align="center"><img src="docs/logo.png" alt="Mediant" width="640" /></p>

Mediant shows what you play on a MIDI keyboard. It names each chord as you play it and lights up the notes on a circle of fifths, a grand staff and an 88-key keyboard.

Try it at https://mediant.dev in Chrome, Edge or Firefox. Safari doesn't support MIDI keyboards.

![Mediant showing Fm11 on the circle of fifths, the grand staff and an 88-key keyboard](docs/screenshot.png)

## Use it

1. Plug in your MIDI keyboard and open https://mediant.dev.
2. Allow MIDI access when the browser asks.
3. Play. With no keyboard connected, keys A to K on your computer play an octave from middle C.

Pick a key at the top of the page and chords are spelled for that key. Pick a sound to hear a built-in piano, or start the metronome and play along.

## Features

- Chord names with inversions, slash chords and extensions, such as Fm11 or Cmaj7/E.
- Notes spelled for the chord or the key, so G♯ minor reads G♯, B and D♯.
- Interval or note-name labels above every key you press.
- Sustain pedal support, and a setting that keeps the last chord on screen after you let go.
- Felt, upright and grand piano sounds, and a metronome with tap tempo.

Mediant runs in your browser, with no account. Your playing never leaves your computer. Chord names come from fixed music-theory rules, so the same notes always get the same name.

## Packages

- `apps/web`: the web app, built with Vite and React.
- `packages/theory`: the theory engine. It names chords from held MIDI notes, spells each note, labels intervals and gives Roman numerals in a key.

## Develop

You need Node.js 22 or later.

```sh
npx -y pnpm@11.5.3 install
npx -y pnpm@11.5.3 --filter @mediant/web dev
npx -y pnpm@11.5.3 test
npx -y pnpm@11.5.3 typecheck
```

Every push to `main` runs the checks and deploys to https://mediant.dev.

## Sounds

The pianos come from free sample libraries. Each pack in `apps/web/public/sounds` has its own `LICENSE.txt`.

- Felt Piano: Fuchs & Möhr Felt Piano by Tom Guder, public domain.
- Upright Piano and Grand Piano: Versilian Community Sample Library by Versilian Studios, CC0 1.0.

`scripts/build-sounds.mjs` rebuilds the packs on macOS, using the built-in `afconvert` encoder.

## Licence

The code is MIT licensed. See `LICENSE`. The sample packs keep the licences listed above.
