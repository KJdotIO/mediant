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

## Licence

MIT. See `LICENSE`.
