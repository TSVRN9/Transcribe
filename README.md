# Transcribe

A simple, keyboard-driven media player for transcription work. Load audio either from a local
file or a YouTube link, then use flag/seek/speed controls (mouse or keyboard shortcuts) to scrub
through it while transcribing. Also includes a pitchgram view — a piano-roll-style visualization
of a clip's pitch content, computed client-side.

SvelteKit app, prerendered to static HTML and deployed to GitHub Pages.

## Developing

Package manager is **pnpm**.

```bash
pnpm install
pnpm dev   # serves under base path /Transcribe, e.g. http://localhost:5173/Transcribe/
```

## Building

```bash
pnpm build     # production build to build/
pnpm preview   # preview the production build
pnpm check     # typecheck
pnpm lint      # prettier --check + eslint
pnpm format    # prettier --write
pnpm deploy    # publish build/ to GitHub Pages
```

See `CLAUDE.md` for architecture notes.
