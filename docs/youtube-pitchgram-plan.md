# YouTube pitchgram via tab-audio capture — action plan

Not started. Written up per user request during the keyboard/UX bugfix pass
(2026-08-15) so the design doesn't have to be re-derived later.

## Why this approach

The app is a fully static site (adapter-static, GitHub Pages, no backend).
Two other options were ruled out:

- **Porting yt-dlp client-side**: dead end. Even a full reimplementation of
  its signature-cipher solving still can't fetch the resolved
  `googlevideo.com` URL from a browser — it doesn't send CORS headers
  permitting cross-origin `fetch()`. Only a server-side proxy gets around
  that, which reintroduces the backend this project deliberately doesn't
  have. Also a heavier ToS exposure than personal yt-dlp use, since it'd be
  shipped to every visitor's browser.
- **Backend yt-dlp service**: works, but means hosting/maintaining a server
  outside GitHub Pages, ongoing cost, and a real ToS gray area for
  downloading YouTube audio server-side.

**Tab-audio capture** (`getDisplayMedia` with audio) stays fully
client-side and doesn't download anything — it samples audio the browser is
already playing. Real-time only, Chromium-only, and needs a per-session
permission picker, but those are acceptable given the alternatives.

## Constraints that don't go away (keep surfacing these before/during build)

- Chromium-only — no Firefox/Safari path (tab-audio capture support is
  inconsistent/absent there).
- Real-time only — a 4-minute video takes 4 minutes to fully cover, no way
  to go faster than 1x.
- `playbackRate` must stay pinned at 1x _during_ an active capture pass
  (speeding up shifts pitch and corrupts analysis). Already-captured/
  analyzed ranges can be scrubbed/sped-up freely once known, same as local
  files.
- Seeking ahead during capture leaves a permanent gap in that time range —
  it was never actually heard. Needs an explicit "not yet captured" state
  in the UI, not silence that reads as "nothing there."
- Manual picker every session (pick "this tab", check "share audio") — no
  persistent grant, can't be automated.

## Phase 1 — capture plumbing

- Add a capture entry point in YouTube mode (replaces/extends the current
  "Pitchgram needs a local audio file" hint in `+page.svelte`).
- `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` —
  video is required by the API even though only the audio track is wanted;
  discard the video track immediately after grant.
- Validate the resulting stream actually has a live audio track from the
  right tab. If the user picks the wrong source or leaves "share audio"
  unchecked, there's no audio track — surface a clear retry prompt instead
  of silently analyzing nothing.
- Force `playbackRate = 1` for the duration of the capture (disable or
  override the speed control in this mode; decide UX when building).

## Phase 2 — resampling + chunking

- `new AudioContext({ sampleRate: 22050 })`, route the captured
  `MediaStream` through a `MediaStreamAudioSourceNode` into it (basic-pitch
  requires exactly 22050Hz mono, same as the local-file path today).
- New `AudioWorkletProcessor` (e.g. `src/routes/capture.worklet.ts`, loaded
  via `audioContext.audioWorklet.addModule`) that collects incoming frames
  and posts fixed-size chunks (~2s of samples, matching basic-pitch's own
  internal window) back to the main thread via `port.postMessage`.
- Mono downmix inside the worklet if the captured stream is multi-channel —
  same idea as `mixToMono` in `pitchgram.ts`, adapted to streaming frames
  instead of a whole `AudioBuffer`.
- Same prerender gotcha class as the existing tf.js dynamic import in
  `computeBasicPitch`: nothing here can touch `AudioContext`/
  `audioWorklet` at module scope, only inside client-only code paths.

## Phase 3 — incremental analysis

- `computeBasicPitch` currently takes one static `Float32Array` and calls
  `model.evaluateModel` once. Add a streaming sibling (or extend it) that
  calls `evaluateModel` per incoming chunk instead, using its existing
  per-window callback to append to `frameRows`/`contourRows`/`onsetRows`
  incrementally rather than all at once.
- After each chunk's inference lands, re-run `maxPoolRows` over the frames
  gathered so far (or append incrementally) and re-dispatch a `pitch`
  event so `PitchgramView` renders the newly available columns live.
- `PitchStatus`/`PitchEventDetail` (in `audio.ts`) need a state for
  "partial/streaming," distinct from today's idle/computing/error/done —
  the view has to know it's showing a growing-but-incomplete result, not a
  finished one.

## Phase 4 — coverage tracking + UI

- Track which `[start, end)` time ranges have actually been captured (a
  sorted list of intervals, updated as chunks land) so the heatmap can
  render "not yet heard" ranges distinctly (dimmed/hatched) instead of
  implying silence.
- Decide: block seeking ahead of the capture point during an active
  session, or allow it and just mark the skipped range as a permanent gap.
- Once a video has played through once, treat its pitch data as complete
  and let scrubbing/`playbackRate` work freely over it, same as local
  files.

## Phase 5 — lifecycle + edge cases

- Stop/cleanup: release `MediaStream` tracks and close the
  `AudioContext`/worklet when pitchgram closes or `mode` switches away
  from `'youtube'`.
- Handle the user stopping the share mid-capture (`track.onended` fires) —
  surface that capture stopped, keep whatever partial data was gathered
  rather than discarding it.
- Decide whether reopening pitchgram on the same video resumes/reuses
  prior partial coverage for that session, or always starts a fresh
  capture (simplest: always fresh, no persistence across reloads).

## Suggested build order

Phases 1+2 (capture + resampling + chunking) are the riskiest/least certain
part — real-world `AudioContext` resampling behavior for a captured stream
and `AudioWorklet` loading under `adapter-static` prerendering are both
things to verify empirically before wiring up the rest. Spike those two
standalone (a scratch page or console experiment) before touching
`PitchgramView`/`pitchgram.ts` for real.
