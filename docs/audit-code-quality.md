# Code quality audit — Transcribe

Whole-repository audit of the working tree as it sits on disk. Read-only; no code was changed.

**Baseline verified during the audit**

| Command      | Result                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| `pnpm build` | passes — prerender clean, adapter-static writes `build/`, PWA precache 27 entries/2283 KiB |
| `pnpm check` | passes — 0 errors, 2 a11y warnings (both `PianoReference.svelte:307`)                      |
| `pnpm lint`  | **fails** — see finding 8                                                                  |

Findings are ranked by real severity: bugs waiting to happen, then traps a future contributor falls into. Trivia is collected in the appendix.

---

## 1. `CLAUDE.md` tells the next contributor that live, user-facing code is dead

**`CLAUDE.md:51`** — "_Legacy path, unused but intact._ `computePitchgram`/`fft`/`extractLines` … still exist and work, just no longer wired up as the default — **nothing currently calls them**."

That is false. They are the entire implementation of the user-selectable **FFT analyzer**:

- `LocalAudio.svelte:12` imports them; `LocalAudio.svelte:88-96` runs them whenever `analyzer === 'fft'`
- `PitchgramView.svelte:544-551` exposes the Analyzer `<select>` with an `<option value="fft">` — reachable in two clicks from the pitchgram view
- `audio.ts:23-27` documents `'fft'` as a first-class analyzer mode
- `scripts/bench-pitchgram.js` benchmarks them against the neural path in ~15 places

**Failure scenario.** `CLAUDE.md` is the file every contributor and every coding agent reads first, and it is explicitly framed as ground truth. Someone doing routine dead-code cleanup deletes ~180 lines (`pitchgram.ts:35-190`, `239-298`) on the doc's authority. `pnpm check` fails loudly because `LocalAudio.svelte`'s import breaks — but the obvious fix looks like "the FFT option was legacy anyway, drop it too," and a shipping feature plus its benchmark harness go with it.

**Fix direction.** Correct `CLAUDE.md:51` to describe the FFT path as the live non-ML analyzer, not a fallback-starting-point. **Keep the code** — it is used, it is benchmarked, and it is the only path that works if the model files 404. While in there: `CLAUDE.md` is also silent on `segment.worker.ts`, `PianoReference.svelte`, `service-worker.ts`, and the whole PWA/share-target subsystem. The doc has drifted roughly two features behind.

---

## 2. Note segmentation has no failure path anywhere along the chain

Three gaps compound into one silent hang:

- **`pitchgram.ts:538-552`** — `getSegmentWorker()` sets `onmessage` but never `onerror` (grepped: no `onerror` handler exists anywhere in `src/`)
- **`pitchgram.ts:574-577`** — `getSegmentedNotes` returns `new Promise((resolve) => …)` with no `reject`, no timeout, and no cleanup of `segmentPending`
- **`PitchgramView.svelte:224` and `:246`** — `segmentNotes(...).then(...)` / `segmentVoices(...).then(...)` with no `.catch`

**Failure scenario.** The worker's `await import('@spotify/basic-pitch/esm/toMidi.js')` (`segment.worker.ts:40`) rejects — offline with a cold cache, a chunk 404 after a redeploy, or `outputToNotesPoly` throwing on a degenerate frame array. The `async onmessage` handler rejects and posts nothing back. The main thread's promise never settles: "Computing notes…" (`PitchgramView.svelte:700-702`) shows forever, `notesComputing` is stuck `true`, and the `segmentPending` entry leaks. There is no error state, no console output, and no recovery short of a page reload. Every subsequent settings change adds another permanently-pending entry.

**Fix direction.** Set `segmentWorker.onerror` to reject all pending entries and drop the worker so the next call rebuilds it; wrap the worker's `onmessage` body in try/catch and post an error response; add `.catch` at both call sites to clear `notesComputing` and surface a message.

---

## 3. `YoutubeAudio` never re-announces readiness for a second video

**`YoutubeAudio.svelte:39-42`**

```js
if (player) {
	player.loadVideoById(videoId);
	return;
}
```

`player` is assigned only inside `onReady` (`:60`), and the IFrame API fires `onReady` **once per player instance**, not per loaded video. `loadVideoById` therefore never re-dispatches `ready`, so the parent's `audiolength` and `seek` (`+page.svelte:80-87`) stay bound to the _first_ video for the rest of the session.

**Failure scenario.** Load a 3-minute video, then paste a 40-minute one. The seek slider's `max` (`+page.svelte:340`) is still 180, so the last 37 minutes are unreachable by mouse; `goToEnd` (`:115`) jumps to 3:00; `jumpForward` (`:113`) clamps at 3:00. Nothing errors — the app is just quietly wrong about the video it is playing.

A related dead-end: `onError` (`:69-77`) dispatches `isReady: false` but leaves `player` assigned and never clears it. If `onReady` fired before `onError` — which YouTube does for embed-disabled videos (101/150), though not reliably for error 2 — then every later `loadVideo()` takes the `loadVideoById` branch, which dispatches nothing. `isReady` stays `false`, `+page.svelte:85` never flips `screen` to `'player'`, and the user is stranded on the source-picker while a video plays invisibly.

**Fix direction.** Move the `ready` dispatch out of `onReady` and into `onStateChange` for `CUED`/`PLAYING`, reading `getDuration()` fresh each time; on `onError`, `destroy()` and null out `player` so the next load rebuilds it.

---

## 4. The analysis error path destroys the evidence and then latches

Two bugs in the same flow:

**`LocalAudio.svelte:109`** — `} catch {` swallows the error object entirely. Decode failure, model 404, tf.js WebGL init failure, OOM: all become the same "Couldn't analyze this file." (`PitchgramView.svelte:716-719`) with nothing in the console. A user report is unactionable without a local repro.

**`pitchgram.ts:366-375`** — `getBasicPitch` caches the _promise_, including a rejected one:

```js
if (!basicPitchPromise) {
	basicPitchPromise = import('@spotify/basic-pitch').then(
		({ BasicPitch }) => new BasicPitch(modelUrl)
	);
}
```

**Failure scenario.** The model fetch fails once — offline on first pitchgram open, or a transient 502 from GitHub Pages. `basicPitchPromise` is now a permanently rejected promise. Every subsequent attempt, for every file, for the rest of the session, fails instantly and identically even after connectivity returns. `pitchCache` (`LocalAudio.svelte:69`) then stores `{ status: 'error' }` per analyzer and only clears when the _file_ changes (`:37-41`), so the user's natural "try again" — reopen the pitchgram — is a no-op that replays the cached error.

**Fix direction.** `.catch((e) => { basicPitchPromise = undefined; throw e; })` on the singleton. Change `catch {` to `catch (err) { console.error('pitch analysis failed', err); … }`. Consider not caching `'error'` entries in `pitchCache`, so retry means retry.

---

## 5. The service worker eagerly precaches tf.js and the model, defeating the dynamic import

**`vite.config.ts:59-62`**

```js
injectManifest: {
	globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,json,bin}'];
}
```

Measured from a real build: the tf.js chunk is **1004 KB** minified, the model is **900 KB** (`728K` weights + `172K` `model.json`), and the PWA plugin reports `precache 27 entries (2283.45 KiB)` — the arithmetic closes exactly.

`pitchgram.ts:370` goes out of its way to `import('@spotify/basic-pitch')` dynamically — correctly, and the build confirms it code-splits into its own chunk. But the service worker then downloads that chunk _and_ the model on first visit, for every user, including everyone who only ever uses the transport controls. The comment at `vite.config.ts:60` says this is for offline pitchgram support, which is a real goal — it just isn't free, and the cost isn't recorded anywhere.

**Fix direction.** Either accept it and document the ~2.3 MB first-visit budget next to that comment, or drop `bin` and the model `json` from `globPatterns` and register a runtime `CacheFirst` route for `basic-pitch-model/*`. The model then caches on first _use_ rather than first _visit_, preserving offline support for anyone who has actually opened the pitchgram once.

---

## 6. Space is globally hijacked, so it can't activate any focused control

**`+page.svelte:174-194`.** Both `keyup` (fires the shortcut) and `keydown` (calls `preventDefault`) exempt only `INPUT`, `TEXTAREA`, and `contenteditable`. Everything else — `<select>`, `<button>`, `<summary>` — is treated as "not a text field, therefore fair game." `shortcuts` (`:131-143`) claims `' '`, `ArrowLeft`, `ArrowRight`, `Home`, and `End`.

Actual blast radius, checked key by key:

| Control     | Blocked                                       | Still works                          |
| ----------- | --------------------------------------------- | ------------------------------------ |
| `<select>`  | Space (menu won't open), Home/End, Left/Right | **Up/Down — changes value normally** |
| `<summary>` | Space                                         | Enter                                |
| `<button>`  | Space                                         | Enter                                |

Nothing is unreachable — `ArrowUp`/`ArrowDown` are deliberately _not_ in the shortcut map, which is what keeps the two `<select>`s operable. Two distinct issues hide here and should be treated differently:

**a. The `<button>` case is intentional and should stay.** `+page.svelte:184-187` says so verbatim — "Space scrolls the page and/or clicks whatever's focused… Suppress the default whenever the key is one of ours so only our shortcut runs." For a transport app that is arguably the right call: Space after clicking Play should toggle playback once, not twice. Noted here only so nobody "fixes" it.

**b. The `<select>` and `<summary>` cases are unintended.** Focus the Analyzer dropdown (`PitchgramView.svelte:544`), press Space to open it — the menu stays shut and the audio starts playing instead. Same for the "Keyboard shortcuts" and "Advanced note settings" disclosures (`+page.svelte:431`, `PitchgramView.svelte:644`): Space does nothing but toggle playback. Surprising, wrong, and invisible to `svelte-check` (correct HTML, wrong runtime behaviour).

**Fix direction.** Narrow the trigger rather than widening the exemption list: run shortcuts only when the event target is `document.body` (nothing focused), or exempt `input, textarea, select, summary, [contenteditable]` while deliberately leaving `button` in scope per (a).

**Coupling to watch (see finding 12).** The pitchgram's time ruler (`PitchgramView.svelte:836-848`) is `role="slider"` `tabindex="0"` with _no keyboard handler of its own_. Left/Right arrows seek it only by accident, via this same global handler leaking through. Narrowing the guard removes that accident — the ruler needs its own `on:keydown` in the same change, not afterwards.

---

## 7. Native-fps model output is held as `number[][]` and retained three times over

`computeBasicPitch` returns `raw: { frames: frameRows, onsets: onsetRows }` at the model's native ~86 fps, unpooled (`pitchgram.ts:495-497`). That object is then:

1. stored in `+page.svelte:50` (`pitchRaw`) for the page's lifetime
2. structured-cloned into the worker and cached there (`segment.worker.ts:26`)
3. `.slice()`-copied **twice per segmentation call**, because `outputToNotesPoly` mutates in place (`segment.worker.ts:43-44`)

For a 10-minute clip: 86 fps × 600 s = 51,600 rows, and `raw` holds **both** `frames` and `onsets` at 88 values wide — so ~9.1M numbers. As JS `number[]` (boxed doubles plus per-array header) that is roughly **72 MB per copy**: ~215 MB resident while Notes mode is open, with each settings-slider release allocating two more 72 MB copies for the GC to chase. Add the decoded `AudioBuffer` from `LocalAudio.svelte:82-83` (the whole file at 22050 Hz Float32) and long-file sessions go memory-bound well before they go CPU-bound.

**Fix direction.** Make the rows `Float32Array` end to end (4 bytes, no boxing, ~4× smaller) and post them to the worker as transferables so step 2 costs nothing. The `.slice()` copies in step 3 stay necessary but become cheap.

---

## 8. `pnpm lint` is red, and its `&&` hides six real ESLint errors

**`package.json:11`** — `"lint": "prettier --check . && eslint ."`

Prettier fails on `.claude/RESUME.md` — an agent scratch file that is in neither `.gitignore` nor `.prettierignore`, so Prettier 3 (which reads `.gitignore` by default) picks it up. The `&&` short-circuits and **ESLint never runs** for anyone using the documented command. Running it directly surfaces six errors:

| File                  | Line       | Error                                                |
| --------------------- | ---------- | ---------------------------------------------------- |
| `+layout.svelte`      | 5:23       | `svelte/no-immutable-reactive-statements`            |
| `+layout.svelte`      | 9:2        | `svelte/no-at-html-tags` (`{@html webManifestLink}`) |
| `YoutubeAudio.svelte` | 25:12      | `no-unused-vars` — `catch (e)` binding unused        |
| `YoutubeAudio.svelte` | 69, 78, 93 | `no-explicit-any` ×3                                 |

The config itself (`eslint.config.js`) is healthy — the three disabled rules (`:24`, `:37`, `:44-45`) each carry a specific, credible justification, and `eslint-config-prettier` is ordered correctly after the recommended sets. The problem is purely that the gate is permanently red and therefore permanently ignored.

**Fix direction.** Add `.claude/` to `.gitignore` (which also fixes Prettier). Change the script to `prettier --check . ; eslint .`, or run both via a small script, so one failure doesn't mask the other. Then fix the six: `YoutubeAudio`'s three `any`s have real types available — `@types/youtube` is already installed and allowlisted in `tsconfig.json:12`, so use `YT.OnErrorEvent` / `YT.OnStateChangeEvent`, and declare `onYouTubeIframeAPIReady` on `Window` instead of `(window as any)`. The `{@html}` at `+layout.svelte:9` is the standard vite-plugin-pwa pattern and only ever interpolates a build-time constant — worth a targeted `eslint-disable-next-line` with that reasoning, not a config-wide exemption.

---

## 9. `+page.svelte`'s state concentration: a hand-maintained reset list and an 11-callback fan-out

`+page.svelte` owns 13 pieces of state (`:45-50`, `:66-74`). `setMode` (`:33-42`) resets **four** of them: `isReady`, `currentTime`, `flag`, `seek` — plus `pitchgramOpen` and `screen`.

Not reset: `audiolength`, `paused`, `playbackRate`, `volume`, `muted`, `pitchStatus`, `pitchResult`, `pitchLines`, `pitchRaw`.

Today this is _masked_, not correct. `setMode` sets `screen = 'select'`, and the entire transport UI lives behind `{#if screen === 'player'}` (`:298`), which only re-opens once a fresh `ready` arrives with `isReady: true`. So the stale `audiolength` is never rendered. **The gating is what's load-bearing — not the reset.** One new UI path that renders playback state before `isReady`, and those nine stale values become live bugs with no compiler help.

The stale `pitchResult`/`pitchLines`/`pitchRaw` sit closer to the surface: `pitchgramOpen` is forced false, but the data itself survives a `local → youtube → local` round trip and would be re-rendered by `PitchgramView` against a `duration` of 0 if the pitchgram were opened before a new file loads.

**The parallel trap** is the transport fan-out. Adding one behavior means editing eight places: the `Behavior` union (`:90-101`), the `behavior` map (`:103-116`), the destructure (`:118-128`), `shortcuts` (`:131-143`), `behaviorLabels` (`:147-159`), the `<PitchgramView>` prop list (`:458-481`), `PitchgramView`'s `export let` block (`:35-45`), and its mobile sheet markup (`:911-940`). TypeScript catches a missing prop, so this is a fan-out cost rather than a latent crash — but eight edit sites for one feature is what makes people stop adding features.

**Fix direction.** Have `setMode` reset by re-assigning a single `initialPlaybackState` object rather than an inline list, so a new field is reset by construction. Replace the 11 callback props with two — the `behavior` map and `behaviorToShortcuts` — collapsing three of those eight edit sites into zero.

---

## 10. The audio-source contract is typed at the payload but never at the component

The task asks whether `LocalAudio` and `YoutubeAudio` faithfully implement the same contract. They mostly do — but **nothing could tell you if they didn't**, and that is the actual finding.

`audio.ts` types only the _event payloads_ (`AudioReady`, `AudioCurrentTime`). There is no type describing an audio source's prop surface, so each component declares props independently and no tool compares them. The drift this permits:

| Aspect                       | `LocalAudio.svelte`                                      | `YoutubeAudio.svelte`                           |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Prop declaration             | `:57-62`, one `export let` list, **all with defaults**   | `:5-8`, separate statements, **all required**   |
| `ready` on source change     | Reactive, re-fires on file _and_ duration change (`:27`) | Once per player instance only — finding 3       |
| `ready` with `isReady:false` | Yes, whenever `audioFile` clears (`:28`)                 | Only on `onError` (`:72`)                       |
| `currentTime` emission       | Reactive, on the element's own `timeupdate` (`:34`)      | 50 ms `setInterval`, unconditional (`:103-108`) |
| Duration changes             | Propagated via `bind:duration` (`:137`)                  | Never re-read after `onReady`                   |

So `<LocalAudio>` compiles fine with no `paused` prop while `<YoutubeAudio>` warns — for two components the architecture doc calls interchangeable.

The polling asymmetry is also a live cost: the interval runs every 50 ms regardless of `paused`, dispatching 20 events/second that each re-render `+page` and re-evaluate `PitchgramView`'s reactive block — while nothing is playing.

**Fix direction.** Declare the contract as one exported type in `audio.ts` (`AudioSourceProps`) and annotate both components' props against it, so a divergence becomes a type error. Give `LocalAudio` the same required-props treatment as `YoutubeAudio`. Gate the interval on `!paused`, or drop it to ~250 ms — the transport display is `secondsToTime`-rounded to whole seconds anyway (`utils.ts:8-21`), so 50 ms buys nothing visible.

---

## 11. `{ frames: number[][]; onsets: number[][] }` is written out ten times

Grepped: ten literal occurrences of that shape across `audio.ts:37`, `+page.svelte:50`, `PitchgramView.svelte:25`, `pitchgram.ts:363`, `:536`, `:564`, `:593`, and `segment.worker.ts:18`, `:26`.

**Maintenance cost.** Finding 7's fix (`number[][]` → `Float32Array[]`) means editing all ten in lockstep; miss one and the mismatch surfaces as a structured-clone shape error inside the worker, far from the edit. Adding a third head from the model (basic-pitch also produces contours) means eleven.

**Fix direction.** One line: `export type RawModelOutput = { frames: number[][]; onsets: number[][] }` in `pitchgram.ts`, referenced everywhere. Highest leverage-per-character fix in this report.

---

## 12. Accessibility gaps beyond finding 6

Ranked within this finding:

**a. Nested `<main>` landmarks.** `app.html:25` wraps `%sveltekit.body%` in `<main>`; `+page.svelte:235` opens another `<main>` inside it. Invalid HTML, and two `main` landmarks (one nested) makes landmark navigation ambiguous for screen-reader users. Fix: drop the wrapper in `app.html` — the route already provides one.

**b. `disabled` used to mean "selected".** `+page.svelte:253` and `:261` set `disabled={mode === 'local' | 'youtube'}` on the source toggle. This removes the _current_ tab from the tab order and announces it as unavailable rather than selected — the inverse of the intent. Fix: keep both enabled and use `aria-pressed`, or `role="tab"` + `aria-selected`.

**c. The pitchgram canvas has no keyboard path.** `PitchgramView.svelte:729-737` — the primary interactive surface (click to seek, drag to pan, pinch to zoom) is pointer-only, with no `role`, no `aria-label`, and no `tabindex`. `svelte-check` does not flag `<canvas>`. The zoom toolbar buttons above it are keyboard-reachable, so panning/zooming is recoverable; seeking by click is not. Fix: at minimum an `aria-label` and a text alternative describing the analyzed range and duration. The ruler's `role="slider"` is the right place to make seeking keyboard-operable — it has `aria-valuemin/max/now` and `tabindex="0"` but no `on:keydown`, which is a WCAG 2.1.1 failure the moment finding 6's global handler stops covering for it.

**d. `role="application"` on the piano.** `PianoReference.svelte:307-321` — the two `svelte-check` warnings. The choice is defended in a comment (`:305-306`) and the reasoning for musical typing is sound, but `role="application"` tells screen readers to disable browse mode and forward _every_ key, and the individual key `<button>`s are all `tabindex="-1"` (`:326`, `:345`) so there is no per-key keyboard path at all. Fix direction: keep the role but scope it to the strip only while focused, and add an `aria-describedby` explaining the QWERTY mapping — or use `role="group"` with a roving tabindex over the keys.

---

## 13. `YoutubeAudio`'s `afterUpdate` is imperative churn on a two-way binding, and is a Svelte 5 migration cliff

**`YoutubeAudio.svelte:117-134`.** Every update cycle issues 3-4 imperative player calls unconditionally: `setPlaybackRate` (guarded), `playVideo`/`pauseVideo`, `setVolume`, `mute`/`unMute`. These are tied to _render frequency_, not to state change — and the component's own 50 ms interval (finding 10) drives a parent re-render 20 times a second.

Simultaneously, `onStateChange` (`:78-84`) writes `paused` **back up** through the same binding that `afterUpdate` reads. Player state and component state are coupled in both directions with no single source of truth, which is exactly the shape that produces "the video won't stay paused" bugs under buffering or network stalls.

**Migration cliff.** The repo runs Svelte 5.56 (`package.json:32`) entirely in legacy mode — `export let`, `on:` directives, `createEventDispatcher`, `afterUpdate`. Most of that has a mechanical runes-mode equivalent. `afterUpdate` does **not**: it does not exist in runes mode at all. Whenever this project migrates, `YoutubeAudio` is the one component that needs a redesign rather than a rewrite, and this is why.

**Fix direction.** Replace `afterUpdate` with per-prop reactive statements (`$: if (player) player.setVolume(volume * 100)` etc.) so each call fires on its own state change. That is both the correct fix today and directly portable to `$effect` later.

---

## 14. `LocalAudio`'s object URL is never revoked

**`LocalAudio.svelte:132`** — `src={URL.createObjectURL(audioFile)}` inside the template. The expression re-evaluates whenever `audioFile` changes, minting a fresh URL each time; `revokeObjectURL` is never called.

Each selection leaves a permanent entry in the blob URL registry keeping the underlying `File` handle alive for the page's lifetime. A transcription session working through a folder of takes accumulates one per file. This is a slow leak, not an immediate hazard — the URL references the on-disk file rather than an in-memory copy — but it is also unbounded and trivially avoided.

**Fix direction.** Hold the URL in a variable, revoke the previous one when `audioFile` changes, and revoke on destroy.

---

## Appendix: minor items

**Error handling**

- `share-target/+page.svelte:10-23` — `try`/`finally` with no `catch`. If `caches.open` rejects (Safari private browsing, no service worker), the `finally` still fires `goto`, so the user is not stranded — but the rejection escapes the async `onMount` callback as an unhandled promise rejection. Add a `catch` that logs.

**`pitchgram.ts` maintainability**

- `pitchgram.ts:417` — bare `88` for the contour grid's semitone count, while its sibling `CONTOUR_BASE_MIDI` is named (`:319`). Name it.
- `TARGET_FRAMES` (`:28`) carries two unrelated meanings: the FFT path's compute budget (which its `ponytail:` comment documents) and the neural path's max-pool column count (a canvas-width constraint). Same number, different reasons to change it. Worth splitting, or at least noting the second use at the definition.
- `NATIVE_WINDOW_OFFSET`'s trailing `+ 0.0018` (`:338`) is honestly labelled a magic number carried from upstream, and the `import.meta.env.DEV` assert at `:350-358` guards it. Good as is — noted so nobody "cleans it up."
- `yieldToUI` (`:94-96`) — the comment justifies `setTimeout` over `rAF` because rAF stalls in a backgrounded tab. True, but `setTimeout` is also clamped to ≥1000 ms in background tabs, so a 2400-frame FFT analysis yielding 24 times still adds ~24 s when backgrounded. The choice is right; the comment oversells it.
- `toRenderedNotes` (`:580-590`) silently drops notes outside the C2..B6 render window. Correct behaviour, but a bass- or piccolo-heavy clip loses notes with no UI indication.

**Type safety**

- `utils.ts:5` — `invertObject`'s `as Record<V, K>` cast is unavoidable, but the function silently drops duplicates. Two keys bound to one behavior means the legend shows one and nothing warns.
- `segment.worker.ts:22` — `self as unknown as Worker`. The correct type is `DedicatedWorkerGlobalScope`; the double cast works but discards real type checking on the worker globals.
- `+page.svelte:167` — `b as Behavior` is safe today (it comes from `Object.entries` over a `Record<Behavior, …>`), but it is the kind of cast that stops being safe quietly.

**Dead code found independently**

- `Icon.svelte` — the `'clock'` variant is declared in the union and has a render branch; no call site uses it.
- `utils.ts:1` `ObjectKey`, `audio.ts:15` `AudioCurrentTimeDetail` — exported, never imported elsewhere.
- `pitchgram.ts:22` `TOP_WINDOW` — exported but only used internally.

Together roughly 20 lines. Not worth a dedicated change; fold into whatever touches these files next.

**Shadowing footgun**

- `PitchgramView.svelte:2` imports `tick` from Svelte; `:850` shadows it with `{#each ticks as tick (tick.t)}`. Harmless today because nothing inside that block calls `tick()`, but the two live 848 lines apart and a future `await tick()` inside the block is a `TypeError` no type checker will catch.

**Repository hygiene**

- `README.md` is untouched `create-svelte` boilerplate. It documents `npm create svelte@latest` and `npm run dev` — directly contradicting `CLAUDE.md:11`'s pnpm mandate — and says nothing about this project. It is the first file a new contributor opens.
- `flutter_app/` is untracked and not in `.gitignore`. An entire parallel port living only in the working tree is one `git clean` from gone, and one `git add .` from landing in a commit nobody reviewed. Decide: commit it, ignore it, or move it out.
- `.claude/` is untracked and unignored — the direct cause of finding 8.

---

## On the absence of a test runner

The recommendation is **not** to add one.

The pure-math layer already has verification proportional to its risk: `scripts/bench-pitchgram.js` (`pnpm bench`) covers both analyzer paths, note segmentation, and voice grouping against synthetic ground truth, and two `import.meta.env.DEV` asserts (`pitchgram.ts:350-358`, `:702-717`) guard the two invariants most likely to break silently — `nativeFrameToTime`'s upstream-derived constants, and `groupIntoVoices`' monophony guarantee. That is a working, framework-free pattern that fits the project.

What is genuinely unverified:

- **`maxPoolRows`' time-bucketing** (`pitchgram.ts:388-410`) — the single highest-risk untested function in the codebase. It is the fix for a documented ~1.2 s drift, its correctness is invisible by inspection, and a regression shows up as "the playhead is behind the music" rather than as a crash. It deserves a dev-assert alongside the existing two: pool a synthetic row set of known duration, assert that the column whose bucket contains second _N_ holds the value planted at second _N_.
- **The Svelte layer** — findings 3, 6, and 9 are all component-interaction bugs that no unit test would have caught anyway. They need a browser, and a full E2E harness is disproportionate for a single-page app with one contributor.

Extend the pattern that already works. Adding Vitest would mean a config, a runner, a CI step, and a second place to look — for coverage the bench script and the dev asserts already provide.
