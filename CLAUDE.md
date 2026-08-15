# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Transcribe: a simple, keyboard-driven media player for transcription work. Load audio either from a local file or a YouTube link, then use flag/seek/speed controls (mouse or keyboard shortcuts) to scrub through it while transcribing. SvelteKit app, prerendered to static HTML and deployed to GitHub Pages.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml` is the lockfile).

- `pnpm install` — install deps
- `pnpm dev` — dev server (serves under base path `/Transcribe`, e.g. `http://localhost:5173/Transcribe/`)
- `pnpm build` — production build via `vite build` + `@sveltejs/adapter-static`, output to `build/`
- `pnpm preview` — preview the production build
- `pnpm check` — `svelte-kit sync` + `svelte-check` (typecheck Svelte + TS)
- `pnpm check:watch` — same, in watch mode
- `pnpm lint` — `prettier --check` + `eslint`
- `pnpm format` — `prettier --write`
- `pnpm deploy` — publish `build/` to GitHub Pages via `gh-pages`

There is no test runner configured in this project.

## Architecture

**State ownership.** `src/routes/+page.svelte` is the single owner of all playback state (`currentTime`, `paused`, `volume`, `muted`, `playbackRate`, `flag`, `isReady`, `audiolength`, `seek`). It also defines the shortcut system: a `Behavior` union type, a `behavior: Record<Behavior, VoidFunction>` map of implementations, and a `shortcuts: Record<string, Behavior>` map from keyboard keys to behaviors. `invertObject` (in `utils.ts`) builds the reverse lookup used to show shortcut keys in tooltips and the keyboard-shortcuts legend.

**Swappable audio sources.** `+page.svelte` toggles between `LocalAudio.svelte` and `YoutubeAudio.svelte` via a `mode: 'local' | 'youtube'` flag (see `setMode`, which resets `isReady`/`currentTime`/`flag` on switch). Both components implement the same informal contract, typed in `src/routes/audio.ts`:

- Receive bound props: `playbackRate`, `paused`, `volume`, `muted`.
- Dispatch a `ready` event (`AudioReadyDetail`: `isReady`, `audioLength`, and a `seek: SeekFunction` closure the parent stores and calls to scrub).
- Dispatch a `currentTime` event on playback progress.

`LocalAudio.svelte` wraps a native `<audio>` element bound to a file `<input>`. `YoutubeAudio.svelte` wraps the YouTube IFrame Player API: it injects the `iframe_api` script itself, waits on `window.onYouTubeIframeAPIReady` before allowing playback (tracked via an `apiReady` flag — the "Load Video" button is disabled until then), and polls `player.getCurrentTime()` on an interval since the IFrame API has no timeupdate event.

**YouTube type-checking gotcha.** The YouTube IFrame API's `YT` namespace comes from `@types/youtube` as an _ambient global_ (no import needed at runtime). But `tsconfig.json` restricts automatic global-type inclusion via a `"types": [...]` allowlist, so `@types/youtube` must be listed there explicitly (as `"youtube"`) or `YT` fails to typecheck even though it resolves fine at runtime.

**Prerendering gotcha.** This is a fully prerendered site (`export const prerender = true` in `+layout.ts`, `adapter-static`). Svelte runs `onDestroy` callbacks during the SSR/prerender pass even though `onMount` never runs server-side. Don't reference browser-only globals (`document`, `window`) directly inside `onDestroy` — register cleanup via the function _returned from_ `onMount` instead, so it only ever runs client-side.

**Styling.** Uses Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no PostCSS, no `tailwind.config.js` — zero-config content detection). `src/app.css` just has `@import 'tailwindcss';` plus a compatibility shim for v4's `currentcolor` default border, and is imported in `+layout.svelte`. The UI is a fixed dark theme (no light-mode variant) built with utility classes directly on markup — no component library, no CSS-in-JS.

**Base path.** `svelte.config.js` sets `kit.paths.base = '/Transcribe'` for GitHub Pages hosting — routes and asset links must account for this prefix.

**Pitchgram signal processing** (`src/routes/pitchgram.ts`, rendered by `PitchgramView.svelte`). Computes a piano-roll-style view of a clip's pitch content, entirely client-side. `LocalAudio.svelte` decodes to 22050Hz mono (`mixToMono`) and calls `computeBasicPitch`, the default processor:

- _Model._ `computeBasicPitch` dynamically imports `@spotify/basic-pitch` (a small onset/frame/contour transcription model that runs via tf.js) and runs it against the model files in `static/basic-pitch-model/`. The import is dynamic (inside the function, not a top-level `import`) specifically so tf.js never loads during the prerender/SSR pass. `evaluateModel` calls its completion callback once per ~1.6s analysis window, not once at the end — results are accumulated across calls, then max-pooled down to `TARGET_FRAMES` columns if the clip is long (native output is ~86 fps; a canvas that wide would blow past the browser's max canvas dimension on a long file).
- _Bin grid._ `BINS_PER_OCTAVE` is 36 (3 bins/semitone) specifically to match basic-pitch's "contours" output resolution exactly, so the model's 264-bin (88 semitones x 3) grid slices straight into this app's C2..B6 render window with no interpolation, just an index offset and a `.slice()`.
- _Normalization._ Contour values are sigmoid probabilities that rarely approach 1 even for confident pitches, so they're rescaled against the clip's own peak (not a fixed 0..1 range) — same "quiet passages don't get rescaled to look as loud as loud ones" idea as a dB-relative-to-peak normalization.
- _Melody/inner-voice/bass line extraction._ Built from basic-pitch's "frames" output (88 semitone-level note-presence probabilities, no sub-bin) — per band, the highest-probability note per frame, median-filtered across frames to kill single-frame jumps. This is the model's own confidence, not a hand-rolled salience heuristic.
- _Legacy path, unused but intact._ `computePitchgram`/`fft`/`extractLines` (a hand-rolled per-octave CQT-like FFT with Klapuri-style harmonic-summation salience) still exist and work, just no longer wired up as the default — nothing currently calls them. If a non-ML fallback or toggle is wanted, they're the place to start.
