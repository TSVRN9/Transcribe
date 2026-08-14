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

**YouTube type-checking gotcha.** The YouTube IFrame API's `YT` namespace comes from `@types/youtube` as an *ambient global* (no import needed at runtime). But `tsconfig.json` restricts automatic global-type inclusion via a `"types": [...]` allowlist, so `@types/youtube` must be listed there explicitly (as `"youtube"`) or `YT` fails to typecheck even though it resolves fine at runtime.

**Prerendering gotcha.** This is a fully prerendered site (`export const prerender = true` in `+layout.ts`, `adapter-static`). Svelte runs `onDestroy` callbacks during the SSR/prerender pass even though `onMount` never runs server-side. Don't reference browser-only globals (`document`, `window`) directly inside `onDestroy` — register cleanup via the function *returned from* `onMount` instead, so it only ever runs client-side.

**Styling.** Uses Tailwind CSS (v3, PostCSS pipeline: `tailwind.config.js`, `postcss.config.js`, `src/app.css` with the `@tailwind` directives, imported in `+layout.svelte`). The UI is a fixed dark theme (no light-mode variant) built with utility classes directly on markup — no component library, no CSS-in-JS.

**Base path.** `svelte.config.js` sets `kit.paths.base = '/Transcribe'` for GitHub Pages hosting — routes and asset links must account for this prefix.
