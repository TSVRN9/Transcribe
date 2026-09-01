# Client-side pitch extraction: state of the art vs. what Transcribe already does

Research note, written 2026-09. Read-only survey — nothing in `src/` was changed.

**How to read this.** Everything below is scored against one question: _does it earn its
place in a statically-hosted, no-backend, ~900KB-model tool for people transcribing music by
ear?_ Most of the survey lands on "no", and says so. The recommendations at the bottom are
ranked, and two of the three add no dependency at all.

Confidence markers used throughout: **[verified]** = checked against this repo or a primary
source this session. **[likely]** = consistent with what I know, not re-checked. **[stale
risk]** = model/tooling landscape moves fast, treat as a lead to confirm, not a fact.

---

## 1. What is actually in the tree right now

Two corrections to the framing this research was commissioned under, both **[verified]** by
reading the code:

**The hand-rolled FFT path is not dead code.** The brief and `CLAUDE.md` both say
`computePitchgram` / `fft` / `extractLines` are "unused, nothing calls them". They are wired
and user-facing:

- `src/routes/LocalAudio.svelte:12` imports `computeBasicPitch, computePitchgram, extractLines, mixToMono`.
- `LocalAudio.svelte:90` calls `computePitchgram` when the analyzer is `'fft'`.
- `src/routes/audio.ts` declares `export type PitchAnalyzer = 'neural' | 'fft'`.
- `src/routes/PitchgramView.svelte:544-552` renders an **Analyzer** `<select>` with both
  options, with user-facing copy in `ANALYZER_INFO`.

So "resurrect the legacy path as a non-ML fallback" is not an available recommendation —
that already shipped. `CLAUDE.md`'s "Legacy path, unused but intact" bullet should be
corrected; it will mislead the next person (it misled this brief).

**The pipeline, as built** [verified]:

| Stage         | Where                                           | Notes                                                                    |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Decode        | `LocalAudio.svelte:82`                          | `OfflineAudioContext(1, 1, 22050)` → `decodeAudioData`, then `mixToMono` |
| Inference     | `pitchgram.ts:443` `computeBasicPitch`          | dynamic `import('@spotify/basic-pitch')`, singleton via `getBasicPitch`  |
| Time-base fix | `pitchgram.ts:340` `nativeFrameToTime`          | reimplements basic-pitch's own per-window offset; has a DEV self-check   |
| Downsample    | `pitchgram.ts:388` `maxPoolRows`                | max-pool to `TARGET_FRAMES = 2400`, bucketed by **real seconds**         |
| Heatmap norm  | `pitchgram.ts:488-490`                          | contour slice ÷ `globalMax` (single max over the clip)                   |
| Lines         | `pitchgram.ts:412` `extractLinesFromNoteFrames` | per-band argmax over **raw** frame probs, `medianFilterPoints`           |
| Notes         | `segment.worker.ts`                             | basic-pitch's own `outputToNotesPoly`, off-main-thread                   |
| Voices        | `pitchgram.ts:639` `groupIntoVoices`            | greedy "VISA-lite" streaming, ≤4 voices                                  |

**Measured baseline cost** [verified]: `static/basic-pitch-model/` is 900KB total (742,392 B
weights + 174,537 B `model.json`). The runtime is `@tensorflow/tfjs@3.21.0`, a **transitive**
dependency of `@spotify/basic-pitch@1.0.1` (`npm ls` confirms; basic-pitch declares
`"@tensorflow/tfjs": "^3.2.0"` in its own `dependencies`). That is the full tfjs meta-package
— core + converter + layers + data + cpu/webgl backends — pinned to a 2022-era version.
Measured from its own prebuilt bundle **[verified]**: `dist/tf.min.js` is 1,294,424 B
minified, **320,510 B gzipped**. So over the wire the runtime is _smaller_ than the 900KB
model (whose bulk is a mostly-incompressible weights `.bin`) — worth knowing, because it
means shrinking the tfjs bundle is not where the download budget actually is. Both are
already behind a dynamic import, so neither costs anything until the user opens the
pitchgram.

**A measurement harness already exists** [verified]: `scripts/bench-pitchgram.js`
(`pnpm bench`) times and scores both paths plus segmentation and voice grouping. Its own
header is refreshingly honest that "accuracy" there means agreement with a _synthetic_
harmonic-stack ground truth, because there is no labeled corpus in the repo. **Every
accuracy claim in this document inherits that caveat** — nothing here has been measured
against real annotated audio, and no recommendation below should be adopted on a claimed
accuracy delta without running `pnpm bench` and, ideally, ear-checking a few real files.

---

## 2. The two filters that decide almost everything

Before the survey, the two questions that kill most candidates before accuracy is even
discussed:

**(a) Does a browser-runnable artifact exist today, and how big is it against the 900KB
baseline?** A statically-hosted tool downloads its model over the user's connection with no
CDN warm cache of its own. 900KB is a rounding error; 20MB is a "please wait" screen; 170MB
is not a feature, it's a different product.

**(b) Which runtime does it need?** tf.js is _already_ in the dependency graph. A second
**tf.js** model costs weights only. An **ONNX-only** model costs ORT-Web's WASM/WebGPU
runtime as a _second_ inference engine alongside tfjs — roughly a megabyte-class fixed cost
plus a whole second class of "why doesn't this work on iOS Safari" bugs, before the model
itself. That single fact separates "SPICE is cheap to try" from "PESTO needs a new runtime"
far more decisively than any published accuracy figure.

---

## 3. Options surveyed

### 3.1 Monophonic pitch trackers — complements, never replacements

The baseline to beat is that melody/inner/bass lines come out of basic-pitch's `frames`
output essentially free (`extractLinesFromNoteFrames`, ~40 lines, zero extra download). A
monophonic tracker cannot replace that: it returns _one_ f0, and this tool's whole point is
seeing more than one voice. The only honest pitch for any of them is a **complement**, on
monophonic material, where they offer something basic-pitch's semitone-quantized `frames`
grid genuinely lacks: **continuous, sub-semitone (cents-level) f0**. That matters for
transcribing vocals, fretless/slide instruments, bends, and intonation drift — and it is
exactly what a singer transcribing a vocal line would want that the current view can't show.

| Model                                       | Runtime                                                                                                                      | Size                                                                                                                                                                             | License                                                                                                       | Verdict                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CREPE** (marl/crepe, ICASSP 2018)         | tf.js demo exists **[verified]**                                                                                             | full ~tens of MB; the official web demo runs a _stripped_ model with **"less than 3 percent of parameters"** and its own README warns it makes more octave errors **[verified]** | MIT (code) **[likely]**                                                                                       | The browser-viable variant is explicitly the degraded one. Accuracy story evaporates at browser size.                                                                                                                                                                                                           |
| **SPICE** (Google, self-supervised)         | **Official tf.js path** — TF Hub documents web + TFLite deployment, and there is a Google-hosted browser demo **[verified]** | single-digit MB **[likely]**                                                                                                                                                     | Apache-2.0 **[likely]**                                                                                       | **The cheapest one to try.** Same runtime already loaded. Returns pitch _and_ an uncertainty output, which maps straight onto the existing `LinePoint.score` field. **[stale risk]**: tfhub.dev is being wound down in favour of Kaggle Models — confirm the artifact URL still resolves before building on it. |
| **PESTO** (2023, transposition-equivariant) | PyTorch; ONNX conversions exist in the wild **[verified]**                                                                   | ~130k parameters **[verified]** → sub-MB weights, genuinely tiny                                                                                                                 | **weights are LGPL-3.0** **[verified via a downstream project that makes it opt-in for exactly this reason]** | Best accuracy-per-byte on paper, but needs ORT-Web (filter b) _and_ carries a copyleft weights license into a redistributed static bundle. Two independent blockers.                                                                                                                                            |
| **pYIN / YIN / SWIPE** (classical DSP)      | pure JS, no model                                                                                                            | 0 bytes                                                                                                                                                                          | permissive                                                                                                    | The actually-lazy option if sub-semitone f0 is ever wanted. Beaten by CREPE on noisy polyphonic mixes, but this tool would only apply it to material the user has already identified as monophonic.                                                                                                             |

**Recommendation for this category: not now.** If sub-semitone vocal pitch ever becomes a
real request, start with **pYIN in JS** (rung 6-7 of the ladder), and only reach for **SPICE**
if pYIN's octave errors are visibly worse than the model's on real files — measurable with
`scripts/bench-pitchgram.js`.

### 3.2 Polyphonic transcription beyond basic-pitch — all server-class

This is the shortest section because filter (a) does all the work.

- **MT3** (Google, multi-task multi-track transcription) — a T5-class encoder-decoder with
  autoregressive token decoding. Hundreds of MB of weights **[likely]**, and the
  autoregressive decode loop is the wrong shape for a browser even if the weights fit. No
  browser artifact exists **[likely]**. **Not viable.**
- **Omnizart** — a Python _pipeline_ (multiple models + orchestration), not a single
  exportable graph. **Not viable**, and not really a model you could port; you'd be porting a
  research toolchain.
- **hFT-Transformer, Onsets-and-Frames, ReconVAT, and the piano-specific AMT lineage** —
  strong on piano, mostly **piano-only**, and mostly checkpoint sizes an order of magnitude
  or two above basic-pitch **[likely]**. This tool is instrument-agnostic by nature (people
  transcribe whatever they're listening to), so a piano-specialist model is a _narrowing_,
  not an upgrade.
- **basic-pitch itself as ONNX** — the model has been exported to ONNX (NeuralNote, the
  audio-plugin port, uses ONNX for at least the CQT/harmonic-stacking front end
  **[verified]**). But see §3.4: this buys nothing here.

**Verdict: basic-pitch remains the right choice, and by a wide margin.** It is, as of now,
close to the only polyphonic transcription model with a maintained, npm-installable,
browser-native, sub-megabyte artifact. Nothing surveyed displaces it. **[stale risk]**: this
is the claim most likely to age — a small distilled AMT model shipping to `transformers.js`
would change the picture, and that's worth a check in a year, not a month.

### 3.3 Source separation as preprocessing — overkill, with one cheap exception

The idea is sound in principle: separate stems, then run basic-pitch on the vocal or bass
stem alone for a cleaner read. The economics say no.

- **Demucs / HT-Demucs in the browser** is real now — `demucs-web` runs an ONNX export via
  ORT-Web with WebGPU/WASM **[verified]** — but the model is **~172MB** **[verified from the
  project's own description]**, i.e. **190× the entire current model budget**, on a
  second inference runtime, with the project's own docs conceding WASM is dramatically slower
  than native. For a tool whose value proposition is "load a file, scrub through it", a
  multi-minute separation preroll behind a 172MB download is a different application.
- **Spleeter** — TensorFlow checkpoints in the tens-to-low-hundreds of MB **[likely]**, no
  maintained browser port **[likely]**, and superseded by Demucs on quality. Same verdict,
  worse trade.
- **HPSS (harmonic/percussive source separation)** is the version of this idea that actually
  fits. It's **pure DSP** — median-filter the magnitude spectrogram along the time axis
  (harmonic) and the frequency axis (percussive), then mask. No model, no download, no new
  runtime, and this repo **already has the FFT** (`fft` in `pitchgram.ts:44`) to build it on. (The existing
  `medianFilter` at `pitchgram.ts:264` does _not_ drop in — it's 1-D over
  `(number | null)[]` with a hardcoded `MEDIAN_WINDOW = 5`, whereas HPSS needs 2-D median
  filtering with tunable kernels along both axes. Still no new dependency, just not free.) On
  drum-heavy material it would meaningfully clean the input before `computeBasicPitch`.

**Verdict: no to learned separation. HPSS is the honest, laziest form of this idea** — and
it is speculative until someone points at a real file where percussion is visibly wrecking
the pitchgram. File it as "if drums turn out to be the actual complaint."

### 3.4 ONNX Runtime Web vs tf.js — does not matter here, and switching is a trap

For basic-pitch specifically, **stay on tf.js**. The reasons are concrete, not preferential:

- `@spotify/basic-pitch`'s `BasicPitch` class and `evaluateModel` are built around tf.js
  tensors; you would be rewriting the wrapper, not swapping a backend.
- `src/routes/segment.worker.ts` deliberately imports `@spotify/basic-pitch/esm/toMidi.js`
  _directly_ to avoid pulling tfjs into the worker — a nice piece of work that a runtime
  migration would have to redo.
- `nativeFrameToTime` in `pitchgram.ts` reproduces basic-pitch's internal windowing arithmetic
  by hand. Any reimplementation risks silently re-introducing the ~1.2s-at-3-minutes drift
  that constant exists to kill.

The cheaper lever in the same neighbourhood, if inference speed ever becomes the complaint,
is **tf.js backend selection** — `tf.setBackend('webgl' | 'wasm' | 'webgpu')` before
`evaluateModel` — not a runtime swap. **[stale risk / worth measuring]**: tfjs is pinned at
3.21.0 transitively, which predates the mature WebGPU backend; a newer tfjs might not be
resolvable without forking basic-pitch's dependency. Check what backend is actually selected
today before assuming there's headroom — a `console.log(tf.getBackend())` is the whole
experiment.

ORT-Web would only become relevant if the app adopted an ONNX-only model (PESTO, Demucs) —
and both of those are declined above for other reasons, so the question is moot.

### 3.5 Onset and beat detection — the most under-exploited asset in the codebase

`computeBasicPitch` already produces and **retains** `raw.onsets` at native ~86fps
(`pitchgram.ts:497`), and it is currently used for exactly one thing: feeding
`outputToNotesPoly` inside the segmentation worker. It is never _shown_.

For transcribing by ear, a **beat/bar grid overlay** is plausibly worth more than any
accuracy improvement in this entire document. Knowing a note lands on beat 3 of bar 12 is
what turns a piano roll into something you can write down. Options, cheapest first:

1. **Onset-strength envelope from the data already in hand** — sum `raw.onsets` across pitch
   bins per frame → a 1-D onset novelty curve, free. Autocorrelate it (or run a small comb
   filter bank) to estimate tempo, then pick a phase that maximizes onset energy. This is the
   textbook Ellis-style beat tracker, it is maybe 60-100 lines, and it needs **zero new
   dependencies and zero new downloads**. Render as vertical lines in the existing SVG
   overlay in `PitchgramView.svelte` next to the `ticks` array.
2. **Spectral flux from the existing FFT path** — same idea for the `'fft'` analyzer, which
   has no `raw.onsets`. Reuses `fft` in `pitchgram.ts`.
3. **essentia.js** (`RhythmExtractor2013`, `BeatTrackerMultiFeature`) — a mature WASM MIR
   library that does this properly. **Blocker: it is AGPLv3 [verified]**. For a static site
   whose JS is served to every visitor, pulling AGPL code in has real licensing consequences
   for the whole app. Also flagged by its own authors as one of the slower extractors. **Not
   recommended** — the licensing alone should end the conversation for a hobby-scale tool
   that presumably doesn't want to relicense itself.
4. Learned beat trackers (BeatNet, the madmom lineage) — no browser artifacts **[likely]**,
   and madmom is itself restrictively licensed for commercial use **[likely]**.

**Verdict: option 1.** It's the one that climbs the ladder — reuse data already computed
rather than add anything.

### 3.6 Confidence and normalization — sanity check of the current approach

The task asked whether the peak-relative rescaling is sound. The rescaling _itself_ is
standard and fine. The problems found are around it, and they're real. All **[verified]** by
reading the code.

**The rescaling is defensible.** `computeBasicPitch:488-490` divides contour values by the
clip's own `globalMax` rather than a fixed 0..1 range. This is the same reasoning as
dB-relative-to-peak in the FFT path and the same reasoning behind per-image contrast
normalization generally. Sigmoid outputs genuinely do compress toward the middle of the
range, and a fixed 0..1 mapping would render most real clips as uniformly dim. Keep it.

**Finding 1 — a single `globalMax` is outlier-sensitive.** One anomalously confident bin (a
loud isolated piano note, a click) rescales the entire clip darker. The standard robustness
fix is a **high-percentile reference (95th–99th) instead of the max**, with values above it
clamped to 1. Practically a one-line change to the `globalMax` loop at `pitchgram.ts:488-489`
(collect, sort, index) and it is what most spectrogram viewers do. Cheap, low-risk, worth
trying against a real file.

**Finding 2 — the heatmap is peak-normalized but the lines are not, and one constant is
doing three different jobs.** `LINE_THRESHOLD = 0.15` is compared against:

- **raw basic-pitch frame probabilities** in `extractLinesFromNoteFrames` (`pitchgram.ts:420`
  — `pooledFrames` are never divided by anything);
- **normalized-dB harmonic salience** in the FFT path's `extractLines` (`pitchgram.ts:294` →
  `bandPeak`, operating on the 0..1 dB-floor-normalized `frames`);
- and it is the **`min` of the UI confidence slider** (`PitchgramView.svelte:628`, default
  `0.4`).

So the confidence slider means "raw model probability" under the Neural analyzer and
"normalized spectral salience" under FFT — two different scales behind one control, and
neither matches the peak-relative scale of the pixels drawn underneath the line. This isn't
a crash, and the current defaults evidently work, but it's the kind of thing that makes
threshold tuning feel arbitrary. Worth at minimum a comment naming the three meanings;
better, three named constants.

**Finding 3 — `OCCUPIED_THRESHOLD` inherits the peak-normalization.**
`PitchgramView.svelte:286` sets `OCCUPIED_THRESHOLD = 0.2` with the comment "same order as
LINE_THRESHOLD" — but `fitVerticalZoom` runs it against the **peak-normalized** `frames`,
while `LINE_THRESHOLD` (neural path) runs against **raw** probabilities. They are not on the
same scale. Consequence: the auto-fitted pitch range depends on how confident the clip's
single loudest bin happened to be. A timid, low-confidence clip gets everything scaled up by
the division and auto-zooms _wider_ than a confident one with identical pitch content.

Adopting the percentile reference from Finding 1 makes this more _stable across clips_, but
it is not free in absolute terms and the two changes are **coupled**: a 99th-percentile
reference is a smaller divisor than the max, so every normalized value gets larger, more bins
clear `OCCUPIED_THRESHOLD`, and the auto-fit range widens on every file. Finding 1 and
Finding 3 have to be fixed in the same change, with `OCCUPIED_THRESHOLD` re-derived against
the new scale — applying the percentile fix alone visibly regresses the default zoom.

**Finding 4 — max-pooling makes long clips look denser.** `maxPoolRows` pools more native
frames per column as the clip gets longer, so a 10-minute file's columns are each a max over
many more frames than a 30-second file's. `globalMax` is invariant to this (max of maxes),
but the _distribution_ shifts up: long clips read visually busier at the same settings. Max
is the right pooling choice — mean would erase short notes, which is worse — so this is a
"know about it" rather than a "fix it". Mentioned only so it isn't mistaken for a
normalization bug later.

**What other tools do**, for comparison: piano-roll viewers over probabilistic AMT output
(the Onsets-and-Frames / basic-pitch demo lineage) generally either (a) show raw probability
with a fixed gamma/power curve for perceptual spread, or (b) percentile-normalize. Very few
use a bare single-max. Nobody, as far as I know, mixes normalized display with raw
thresholds — that's this codebase's own quirk, and Finding 2 is the most genuinely
actionable item in this document.

---

## 4. Recommendations

Ranked by (user-visible benefit for by-ear transcription) ÷ (bundle + compute + maintenance).
Note that the top three add **no new dependency, no new model download, and no new runtime**.
That is not a coincidence — it's what the constraints force, and it's the correct outcome.

### If you do one thing

**Unify the confidence/normalization scales (§3.6, Findings 1-3).** Nothing else on this list
improves the tool's _honesty_ — right now the confidence slider that users are told "hides
notes the model isn't confident about" reads a different quantity per analyzer, and the
auto-zoom range silently depends on the clip's loudest bin. Concretely:

1. Replace the single `globalMax` at `pitchgram.ts:488-489` with a ~99th-percentile
   reference, clamping above 1.
2. Split `LINE_THRESHOLD` into per-path constants (`NEURAL_FRAME_THRESHOLD` on raw
   probabilities, `FFT_SALIENCE_THRESHOLD` on normalized salience) and give
   `PitchgramView.svelte`'s slider its own explicit floor.
3. Re-derive `OCCUPIED_THRESHOLD` in `fitVerticalZoom` from whichever scale it's actually
   reading.

**These three sub-steps must land together, not incrementally.** Step 1 shrinks the divisor,
which enlarges every normalized value, which makes more bins clear `OCCUPIED_THRESHOLD` —
so shipping step 1 alone widens the auto-fit pitch range on every file and reads as a
regression. Step 3 is part of the same change, not a follow-up.

Small diff, no download, no new concepts in the codebase, and it makes every subsequent
threshold experiment interpretable. Verify with `pnpm bench` plus an eyeball on two or three
real files of different loudness.

### If you do three things

**2. Beat/bar grid from `raw.onsets` (§3.5).** The highest _feature_ value in this document.
Sum `raw.onsets` across bins → onset novelty curve → autocorrelation for tempo → phase by
maximum onset energy → draw beat lines in the existing SVG overlay in `PitchgramView.svelte`,
alongside the `ticks` time ruler. ~100 lines, zero new bytes shipped, uses data
`computeBasicPitch` already returns and currently only hands to the segmenter. For someone
transcribing by ear, "which beat is this note on" is a question the tool currently can't
answer at all. Start with a fixed global tempo; variable tempo is a much harder problem and
almost certainly not needed for the target use case.

**3. Fix `CLAUDE.md`'s stale claim about the FFT path (§1).** Free, and it's the reason this
research brief contained a wrong premise. One-line edit to the "Legacy path, unused but
intact" bullet: it is wired to a user-facing Analyzer select.

### Explicitly do not do

- **Do not replace basic-pitch.** Nothing surveyed is both browser-viable and better. It is
  close to a category of one. (§3.2)
- **Do not add source separation.** Demucs in-browser is ~172MB against a 900KB baseline, on
  a second runtime. If percussion turns out to be a real complaint on real files, hand-rolled
  HPSS on the existing `fft` is the answer, not a learned separator. (§3.3)
- **Do not migrate to ONNX Runtime Web.** It buys nothing for basic-pitch and would force
  rewriting the wrapper, the worker's `esm/toMidi.js` import trick, and the
  `nativeFrameToTime` correction. If inference speed becomes the complaint, check
  `tf.getBackend()` first. (§3.4)
- **Do not add essentia.js.** AGPLv3, on a site that serves its JS to every visitor. (§3.5)
- **Do not add a monophonic tracker yet.** CREPE/SPICE/PESTO can only complement, never
  replace, and the thing they'd add (cents-level f0) is a feature nobody has asked for. If it
  is ever wanted, try pYIN in plain JS before downloading a model. (§3.1)

---

## 5. Uncertainty register

Things a future reader should re-check rather than trust:

- **SPICE's hosting**: tfhub.dev is being retired toward Kaggle Models. The tf.js artifact URL
  in older tutorials may not resolve.
- **The "basic-pitch is uniquely browser-viable" claim** is the most perishable statement
  here. A distilled AMT model landing in `transformers.js` would change it.
- **All model sizes** given for things not in this repo are order-of-magnitude
  recollections, except basic-pitch's 900KB (measured), tfjs 3.21.0's 320KB gzipped
  (measured from its prebuilt `tf.min.js`, not from an actual Vite build of this app — the
  real chunk could differ with tree-shaking), and Demucs-web's ~172MB (from the project's own
  description). Confirm before budgeting.
- **All accuracy claims** — mine and the literature's — are untested against real annotated
  audio in this project. `scripts/bench-pitchgram.js` measures against a _synthetic_
  harmonic-stack ground truth by its own admission, which is the right tool for regression
  testing and the wrong tool for settling "is model X more accurate than model Y".
- **License claims** for CREPE (MIT) and SPICE (Apache-2.0) were not re-verified this
  session. PESTO's LGPL-3.0 weights and essentia.js's AGPLv3 _were_ — those are the two that
  matter, and both point away from adoption.
