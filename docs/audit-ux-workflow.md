# Transcribe — UX Workflow Audit

Scope: friction in the actual scrub → listen → flag → transcribe loop, not visual
polish. Findings are ordered by how much they slow or interrupt that loop.

**Method note / limitation.** No Chrome binary and no connected claude-in-chrome
extension were available in this sandbox (`mcp__claude-in-chrome` reported "extension
not connected"; `chrome-devtools-mcp` reported no `/opt/google/chrome` executable), so
this audit could not drive the running app live. Findings below are grounded in a full
read of `src/routes/+page.svelte`, `LocalAudio.svelte`, `YoutubeAudio.svelte`,
`PitchgramView.svelte`, `pitchgram.ts`, `audio.ts`, `utils.ts`, and `PianoReference.svelte`,
and each is tagged **[verified]** (the code makes the behavior unambiguous) or
**[needs live check]** (the mechanism is clear from source but the net effect depends on
runtime event ordering that reading alone can't settle). Treat `[needs live check]` items
as hypotheses to confirm, not confirmed bugs.

---

## 1. Mode switch destroys state with no warning — top finding

**[verified]** `src/routes/+page.svelte:266-287`:

```svelte
{#if mode === 'local'}
	<LocalAudio ... />
{:else if mode === 'youtube'}
	<YoutubeAudio ... />
{/if}
```

This is a Svelte `{#if}`, not the CSS `sr-only` trick the file uses elsewhere (that
trick — see the comment at line 28-30 — only applies to the _select vs. player screen_
toggle, keeping `screen === 'select'` non-destructive). Switching **mode** (Local ↔
YouTube) unmounts the losing component outright. For Local → YouTube → Local this means:

- `audioFile` and the decoded `<audio>` element are gone — the user must re-pick the file.
- `pitchCache` (declared inside `LocalAudio.svelte:69`, not hoisted to the parent) is
  gone — a completed neural pitch analysis, which can take real wall-clock time on a
  longer clip, is silently discarded. Reopening Pitchgram after switching back re-runs
  the model from scratch.
- `flag` and `currentTime` are force-reset to 0 by `setMode` (`+page.svelte:33-42`).

And this is one click away with zero confirmation: the Local File / YouTube toggle
buttons sit right on the "select" screen (`+page.svelte:247-263`), which is one click
from the player screen via "← Change source" (`+page.svelte:219-222`). A user who meant
to just glance at the source screen and taps the wrong toggle button loses their flag,
playback position, and any completed analysis in one unrecoverable action.

**Before:** clicking the other mode's button while a session is active silently drops
`audioFile`, `pitchCache`, `flag`, and `currentTime`.

**After:** mirror the pattern already used for `screen`: keep both `LocalAudio` and
`YoutubeAudio` mounted (hidden via the same `sr-only` idiom, or simply always-mounted
with a `hidden` class) instead of `{#if mode === ...}`, so switching away and back
doesn't unmount either one. If keeping both mounted is undesirable (e.g. YouTube's
iframe player has real teardown cost), at minimum gate the _destructive_ switch behind a
confirm when there's something to lose (`flag > 0`, `pitchCache` non-empty, or a file
loaded) — the non-destructive "Change source" affordance already exists right next to
it, so the fix is UI, not architecture.

---

## 2. Pitchgram's own controls silently swallow every shortcut

**[verified]** The global shortcut guard in `+page.svelte:174-194` is:

```js
if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
```

`PitchgramView.svelte` has five range inputs (Confidence `:627-633`, Onset `:651-659`,
Frame `:663-671`, Min length `:677-685`) and none of them call `.blur()` on
`change`/`pointerup` the way the main seek slider deliberately does
(`+page.svelte:337-338`: `on:pointerup={(e) => e.currentTarget.blur()}`). So: drag the
Confidence slider once while eyeballing the pitchgram, and every keyboard shortcut —
Space, flag, seek, speed — goes dead until the user manually clicks somewhere else to
move focus off the slider. In a tool whose whole premise is "adjust something, then use
the keyboard to keep working," this is a real trap, and it sits inside the one view
that's supposed to _help_ the core loop, not interrupt it.

**Before:** any interaction with the four Pitchgram range sliders leaves focus parked on
an `<input>`; Space/flag/seek/speed shortcuts stop firing until an unrelated click clears
focus, and nothing in the UI signals why.

**After:** add the same `on:pointerup={(e) => e.currentTarget.blur()}` (or
`on:change`) already used on the main seek slider to all four sliders — one line each,
consistent with the pattern the codebase already established for exactly this problem.

---

## 3. The Analyzer / View dropdowns trap keyboard input the other direction

**[verified]** `<select>` elements (`PitchgramView.svelte:544-551` Analyzer,
`:555-564` View) are **not** caught by the same guard — `tagName` is `SELECT`, which
matches none of `INPUT`/`TEXTAREA`/`isContentEditable`. But `keydown`
(`+page.svelte:188-194`) calls `event.preventDefault()` on every key that's in the
`shortcuts` map, including Arrow Left/Right, Space, and Home/End, _before_ checking
whether the browser needed those keys for something else. Result once one of these
selects has focus: Arrow Left/Right no longer move the dropdown's highlighted option —
they seek the audio instead; Space doesn't open the dropdown, it toggles playback. The
dropdown becomes keyboard-inert while every arrow/space press does something else
entirely, which is confusing in the opposite direction from finding #2 (there, shortcuts
go silent; here, they hijack a control that looks focused and interactive).

**Before:** focusing the Analyzer or View `<select>` and pressing Arrow/Space drives
playback instead of the dropdown.

**After:** either extend the guard to include `SELECT`, or swap the two native
`<select>` elements for a small button-group (consistent with the rest of the app's
control style, which is already all custom buttons, not native form controls) — that
also sidesteps relying on `<select>`'s inconsistent native keyboard model across
browsers.

---

## 4. YouTube: pasting a bad link fails completely silently

**[verified]** `YoutubeAudio.svelte:33-37`:

```js
const loadVideo = () => {
	error = '';
	if (!videoId || !apiReady) {
		return;
	}
	...
```

`error` is reset to `''` immediately, and the only case that sets it back is the
player's own `onError` callback (`:69-77`), which fires _after_ a video actually starts
loading. Paste something that isn't a parseable video URL — a bare video ID, a playlist
URL, a channel link, a typo — and `videoId` comes back `undefined` from the try/catch at
`:17-28`; `loadVideo` returns on the guard with no error shown at all. Clicking "Load
Video" (or pressing Enter) visibly does nothing. A user's first reaction is "did that
register?", and their second is to click it again a few more times — pure dead end,
worse than an error message because it doesn't even tell you it failed.

**Before:** an unparseable link produces no feedback; the button appears unresponsive.

**After:** set a specific `error` (e.g. "Couldn't find a video ID in that link") in the
`!videoId` branch of the guard, distinct from the `apiReady` case (which already has its
own affordance via the disabled button + "Loading player…" label).

---

## 5. Keyboard shortcuts are invisible until a file is already loaded

**[verified]** The "Keyboard shortcuts" legend is a `<details>` element at
`+page.svelte:431-446`, nested inside the block gated by `{#if screen === 'player'}`
(`:298`). Before any file/video is loaded — i.e. exactly when a new user is looking at
the screen deciding what this app even does — there is no shortcut hint anywhere: no
legend, no tooltip, no onboarding text. The tooltips on individual transport buttons
(`title={tooltip(...)}`) are genuinely useful once you're looking at the player, but
they require already knowing which button does what and hovering it — not a discovery
path for someone who hasn't loaded media yet. And even once a file is loaded, the legend
is collapsed by default (`<details>` with no `open` attribute), so it's an extra click
to see the full list versus stumbling onto it via tooltip discovery one control at a
time.

**Before:** a first-time user sees a file picker and mode toggle, nothing else — the
entire shortcut system (the app's main value proposition per `CLAUDE.md`, "keyboard-
driven media player for transcription work") is undiscoverable pre-load.

**After:** either surface the shortcut legend on the select screen too (it doesn't
depend on `isReady`), or open the `<details>` by default the first time a file is
loaded (collapsing it after the user demonstrably interacts with a shortcut, tracked via
e.g. `localStorage`) — cheap, no architecture change, and it directly targets the
"can a new user find the shortcuts without reading source" question this audit was
asked to check.

---

## 6. No key-repeat on hold for speed/seek adjustments

**[verified]** Shortcuts fire on `keyup`, not `keydown`
(`+page.svelte:174-182` vs. `:188-194` — `keydown` only calls `preventDefault()`, the
actual `behavior[b]()` call lives in `keyup`). Browsers auto-repeat `keydown` while a
key is held, but never auto-repeat `keyup` — it fires exactly once, on release. So
holding `>` down does **not** ramp playback speed up continuously; it takes one full
press-and-release per 0.1x step. Going from 1.0x to 1.5x is five discrete taps, not one
held key. Same for `jumpBack`/`jumpForward` (5s per tap) and the flag-adjust keys. This
directly taps the loop the audit was asked to evaluate — "does flag → seek → adjust
speed → re-listen feel fast" — and five taps to change speed once is friction a held key
would remove.

**Before:** adjusting playback speed by more than one 0.1x step requires repeated
discrete key presses.

**After:** either let native `keydown` auto-repeat drive the behavior directly (with a
debounce/guard on the very first press to avoid double-firing on the initial
keydown+keyup pair), or explicitly implement press-and-hold repeat with a short initial
delay — either restores the "hold to keep going" affordance users expect from this class
of control.

---

## 7. Native `<audio>` element may double-toggle Space

**[needs live check]** `LocalAudio.svelte:130-141` renders a real `<audio controls>`
element with `bind:paused`. Its `tagName` is `AUDIO`, which the shortcut guard at
`+page.svelte:174-194` does not exclude. Browsers give a focused `<audio controls>`
element its own native Space-bar play/pause handling. If a user's first instinct is to
click the native play button (a very likely first action, before anyone has learned the
app's own shortcuts) and then presses Space to pause, two things may fire: the browser's
native toggle (which the two-way `bind:paused` reflects back into Svelte state) and this
app's `behavior.togglePlayback` (`+page.svelte:111`, `paused = !paused`) from the global
`keyup` listener. Depending on event/update ordering these could cancel out (Space
appears to do nothing) or double-fire (Space toggles twice, net no-op, or toggles the
wrong direction). The mechanism is real; the net user-visible effect needs confirming in
an actual browser, which this sandbox couldn't do.

**Before (if confirmed):** Space behaves unreliably once the native audio control has
focus.

**After:** blur the `<audio>` element after its native play/pause is used (mirroring the
seek-slider pattern already used elsewhere), or hide the native `controls` attribute
entirely and rely solely on the app's own transport buttons — the native controls
duplicate functionality the app already provides its own UI for.

---

## 8. Pitchgram analysis is all-or-nothing despite the model already streaming partial results

**[verified]** `computeBasicPitch` (`pitchgram.ts:443-499`) collects rows from
`model.evaluateModel`'s incremental callback (`:461-469`, called roughly every 1.6s of
audio per `CLAUDE.md`) into local arrays, but only returns the assembled result after
`await model.evaluateModel(...)` fully resolves. `LocalAudio.svelte`'s `computePitch`
(`:74-115`) only dispatches the `'pitch'` event once, on final success — never
progressively. Meanwhile `PitchgramView.svelte:707-715` shows a full-panel spinner
("Analyzing pitch content…") for the entire duration with no partial rendering. On a
longer clip this is a real, avoidable wait where the underlying model already has the
data to show something incremental — the plumbing for progressive results already exists
in the callback, it's just discarded until the end.

**Before:** opening Pitchgram on anything but a short clip blocks on a spinner for the
full analysis duration, showing nothing until it's completely done.

**After:** thread the `evaluateModel` callback through to a progressively-updating
`pitchDispatch('pitch', {status: 'computing', partialFrames})`, and have
`PitchgramView` draw whatever's accumulated so far instead of only a spinner — lets a
user start orienting on the visible portion of a long clip while the tail is still
computing. This is more work than the other findings here, so it's reasonable to treat
as a "nice to have" rather than blocking, but it's the main place the pitchgram feature
currently _adds_ friction to the loop rather than removing it, which is exactly the
tradeoff this audit was asked to weigh.

---

## Mobile — what the code shows (not live-tested)

**[needs live check for feel, verified for structure]** The single breakpoint is `lg`
(1024px, Tailwind default — confirmed via `grep` across `+page.svelte`/
`PitchgramView.svelte`, only `sm`/`lg` variants are used, no `md`/`xl`). Below that:

- Pitchgram takes the full viewport (`+page.svelte:453-456`, `fixed inset-0 z-40`),
  covering the header (including the "← Change source" link) — the only way back is
  Pitchgram's own close button (`PitchgramView.svelte:595-600`, a 44px target). This is
  intentional and reads fine from the code; not a finding.
- The mobile transport bar (`PitchgramView.svelte:866-895`) renders **outside** the
  `{#if status === 'computing'}` block, so play/pause/jump/speed/flag stay reachable
  even while analysis is running — a good call, confirmed structurally.
- Touch targets in the mobile sheet and transport bar are consistently `h-11`/`w-11`
  (44px), matching the platform-minimum guidance; this was clearly a deliberate pass
  (the diff in `PitchgramView.svelte` bumped several buttons from `h-9 w-9` to
  `h-11 w-11` specifically).
- Findings #2 and #3 above (focus-trap on sliders/selects) apply identically on
  mobile/touch, likely worse there since there's no stray-click-elsewhere affordance as
  natural as on desktop — tapping outside the sheet closes it (`:897-904`), but tapping
  a slider inside it still parks focus the same way.

No mobile-specific findings beyond what's already listed — the pinch-zoom/pan gesture
work in the in-progress `PitchgramView.svelte` diff (pointer-based pinch-to-zoom
anchored at the pinch midpoint, added since the last commit) reads as solid from the
code, but gesture feel is exactly the kind of thing that needs a real touchscreen to
confirm, which this audit could not do.

---

## Summary table

| #   | Stage               | Finding                                                                            | Confidence       |
| --- | ------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| 1   | Mode switch         | Local↔YouTube toggle unmounts source, silently drops file, pitch cache, flag, time | verified         |
| 2   | Pitchgram           | Range sliders don't blur → global shortcuts go dead                                | verified         |
| 3   | Pitchgram           | Analyzer/View `<select>`s not guarded → arrows/space hijack them instead           | verified         |
| 4   | Load (YouTube)      | Bad link → `loadVideo` fails with zero user feedback                               | verified         |
| 5   | Load                | Shortcut legend invisible until a file is loaded, then collapsed by default        | verified         |
| 6   | Speed/flag controls | No key-repeat on hold; each step needs its own press+release                       | verified         |
| 7   | Scrub/transcribe    | Native `<audio controls>` may double-toggle Space                                  | needs live check |
| 8   | Pitchgram           | All-or-nothing loading spinner despite model streaming partial results             | verified         |
