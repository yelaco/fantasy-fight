# Fantasy Fight

A browser-based 2D fighting game built with **Phaser 3**, **Vite**, and **TypeScript**.

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Building

```bash
npm run build
```

Produces a fully static site in `dist/`. The Vite config uses `base: './'` so the build works correctly at any URL subpath — no hardcoded absolute paths.

## Deploying

### GitHub Pages

Option A — push `dist/` directly to the `gh-pages` branch:

```bash
npm run build
git subtree push --prefix dist origin gh-pages
```

Option B — use the [GitHub Pages GitHub Action](https://github.com/actions/deploy-pages) to build and deploy automatically on push.

Because `base: './'` is set, the game loads assets correctly regardless of whether it is served from the repo root or a subpath (e.g. `https://user.github.io/fantasy-fight/`).

### Netlify

Drag and drop the `dist/` folder onto the Netlify dashboard, or connect the repo and set:
- Build command: `npm run build`
- Publish directory: `dist`

### itch.io

Run `npm run build`, zip the contents of `dist/`, then upload the zip to itch.io as an HTML game.

## Notes

- Assets: sprite sheets and backgrounds from CraftPix.
- Audio: synthesized at runtime via the Web Audio API — no audio files are bundled.
