# Mediant

Plug in a MIDI keyboard and see what you play: the chord name, the notes on a keyboard and staff, and the chord's shape on the circle of fifths.

## Packages

- `packages/theory`: the theory engine. It names chords from held MIDI notes, spells each note, labels intervals and gives Roman numerals in a key.

## Develop

You need Node.js 22 or later.

```sh
npx -y pnpm@11.5.3 install
npx -y pnpm@11.5.3 test
npx -y pnpm@11.5.3 typecheck
```

## Sounds

The built-in pianos come from free sample libraries. Each pack in `apps/web/public/sounds` has its own `LICENSE.txt`.

- Felt Piano: Fuchs & Möhr Felt Piano by Tom Guder, public domain.
- Upright Piano and Grand Piano: Versilian Community Sample Library by Versilian Studios, CC0 1.0.

`scripts/build-sounds.mjs` rebuilds the packs. It needs macOS, because it encodes with `afconvert`.

## Licence

The code is MIT. See `LICENSE`. The sample packs keep their own licences, listed above.
