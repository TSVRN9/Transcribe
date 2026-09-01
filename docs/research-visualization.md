# Pitchgram visualization research — ideas for transcription work

Research/brainstorm doc, grounded in `src/routes/PitchgramView.svelte` and
`src/routes/pitchgram.ts` as of 2026-09. Nothing here is implemented; ranked by how much
each idea helps someone scrubbing audio and transcribing by ear — not by visual novelty.

## What the view does today (baseline)

- **Heatmap**: canvas at 1px/frame-column x 1px/bin-row (`draw()`), CSS-scaled with
  `image-rendering: pixelated`, colored by `pitchColor()` through `COLOR_STOPS`
  (dark → blue → cyan → yellow-white).
- **Combined**: three per-band argmax lines (`linePath()`), melody `#fb923c` / inner
  `#a78bfa` / bass `#22d3ee`, gapped below `confidenceThreshold`.
- **Notes**: basic-pitch note segmentation rendered as fixed-height amber rects
  (`height={SEMITONE_BINS}`, `fill="#fbbf24"`, opacity from `note.amplitude`).
- **Voices**: same rects, colored per stream from `VOICE_COLORS`
  (`#fb923c`, `#a78bfa`, `#22d3ee`, `#f472b6`).
- **Grid**: CSS `gridStyle` — 1px semitone lines (alpha 0.06) and octave lines (0.16).
- **Playhead/flag**: 1px white and red divs; sticky triangle marker; DAW-style
  `followPlayhead`.
- **Unused data already in hand**: `raw.onsets` (per-frame onset probabilities) is
  plumbed through `BasicPitchResult` and the view props but never drawn. The contour
  grid is 3 bins/semitone (`CONTOUR_BINS_PER_SEMITONE`), i.e. sub-semitone pitch
  information exists but the Notes/Voices rects flatten it to the semitone center
  (`bin: (midi - RENDER_BASE_MIDI) * 3 + 1`).

## How the reference tools present this information

- **Melodyne**: notes are _blobs_ — the vertical center rides the actual measured pitch
  curve (vibrato, bends, portamento visible inside the blob), thickness/opacity encode
  amplitude, and a thin "pitch-center" line marks the nominal semitone. The blob shape is
  the killer feature for by-ear work: you can see that a note _scoops into_ its pitch or
  sits 30 cents flat, which is exactly what your ear is fighting to name.
- **Logic Flex Pitch**: plain piano-roll bars, but on a piano-roll background with
  black-key lanes shaded darker, plus per-note "hot spots" and a hover readout of note
  name + cent deviation. The lane shading is what makes instant pitch identification
  work — nobody counts gridlines.
- **Sonic Visualiser**: everything is a stackable layer with independent opacity — a
  spectrogram under a note layer under a time-instants (onsets) layer; plus a "harmonic
  cursor" that, when you hover a frequency, draws ghost lines at its integer harmonics so
  you can tell a real note from an overtone of the bass.
- **AnthemScore**: spectrogram with detected notes overlaid, then a linked staff-notation
  pane; clicking a note auditions its pitch. The audition-on-click loop (see → hear →
  confirm) is the transcription-specific interaction the current view lacks.
- **Chromagrams**: fold octaves away to 12 pitch classes; poor for melody, excellent for
  "what chord/key is this" when octave placement is ambiguous — the most common failure
  mode when transcribing dense accompaniment.
- **DAWs (Ableton/Cubase) & Synthesia-style players**: follow-playhead scroll (already
  implemented here as `followPlayhead`), plus _lighting up the currently sounding notes_
  at the playhead so eye and ear stay locked together.

---

## Quick wins (small changes to existing rendering)

Ranked. Each is a change to `PitchgramView.svelte` only unless noted.

### 1. Hover + playhead pitch readout (note name and cents)

**Why it helps**: the core question during transcription is "what note is that blob?"
Today the answer requires eyeballing horizontally to a 10px gutter label, and the gutter
only shows all semitone names when `pxPerSemitone >= 18`. A readout removes the whole
eye-travel step.

**What changes**: `onPointerMove` already receives every canvas move. Compute
`bin = TOTAL_BINS - 1 - Math.floor((e.clientY - rect.top) / scaleY)`, map to name via the
existing `NOTE_NAMES`/`OCTAVE_START` math (same formula `noteLabels` uses). Because the
grid is 3 bins/semitone, the sub-bin position also gives a coarse ±33-cent readout for
free. Show it in the toolbar row (there's free space next to the zoom buttons) or as a
small fixed chip — no new data needed. Highlight the matching gutter label / draw a 1px
horizontal crosshair line at the hovered row at the same time.

### 2. Black-key lane shading in the grid

**Why it helps**: this is the single cheapest "read pitch at a glance" device every
piano-roll (Logic, Ableton, MuseScore) uses. With only uniform 0.06-alpha semitone lines,
identifying "that's an F#" means counting rows from a C label; with C#/D#/F#/G#/A# rows
tinted darker, the eye pattern-matches the 2-3 black-key clusters instantly, exactly like
reading a keyboard.

**What changes**: extend the CSS `gridStyle` string. It's already a percentage-based
`repeating-linear-gradient` stack; add one more repeating gradient per octave
(`100 / OCTAVE_COUNT` period) with hard color stops at the five black-key row bands
(each `semitonePct` tall) in something like `rgba(0,0,0,0.25)`. Pure CSS, stays correct
at any `scaleY`, zero canvas changes. It also visually reconciles with `PianoReference`,
which the user is bouncing against anyway.

### 3. Light up currently sounding notes at the playhead (Notes/Voices modes)

**Why it helps**: while audio plays, the transcriber's job is matching what they _hear
now_ to a mark on screen. The playhead line crosses dozens of rects; brightening the 1-4
rects actually sounding (Synthesia/Melodyne behavior) fuses ear and eye — especially at
slow `playbackRate`, this app's whole point.

**What changes**: in the `{#each notes}` / `{#each voiceStreams}` blocks, a note is
"sounding" when `nativeFrameToTime(note.startFrame) <= currentTime <
nativeFrameToTime(note.startFrame + note.durationFrames)`. Precompute both times once per
note when `notes`/`voiceStreams` land (avoid calling `nativeFrameToTime` per rect per
frame tick), then a reactive `$:` set of sounding indices keyed off `currentTime`. Render
sounding rects with full opacity + a bright stroke; optionally push the sounding pitches
into `PianoReference` as highlighted keys (it already has `pressedMidis` machinery — a
second highlight set via a prop is a small addition).

### 4. Dim the heatmap under Notes/Voices overlays

**Why it helps**: right now the amber/voice rects fight the full-brightness heatmap —
both are high-chroma, and the rects sit at `opacity={0.35 + amplitude * 0.65}`, so a
quiet note over a bright contour blob is nearly invisible. Sonic Visualiser's per-layer
opacity is the model: overlay modes should treat the heatmap as context, not signal.

**What changes**: one conditional class/style on `canvasEl` — e.g.
`style:filter={viewMode === 'notes' || viewMode === 'voices' ? 'brightness(0.45) saturate(0.5)' : ''}`.
No redraw, GPU-side, instant. (Doing it in `pitchColor` would need a re-`draw()` per mode
switch — the CSS filter is strictly better here.)

### 5. Redundant (non-color) coding for lines and voices + a colorblind-safe palette

**Why it helps**: fixed dark theme, no alternate mode, so palette choice is load-bearing.
The heatmap ramp (`COLOR_STOPS`) is actually fine — it's monotonic in lightness, so it
survives every CVD type. The problem is the categorical colors: `#a78bfa` (violet) vs
`#f472b6` (pink) in `VOICE_COLORS` are a known protan/deutan confusion pair, and orange
vs pink also compresses. When "which voice is this note in?" is the entire question the
Voices mode exists to answer, two voices that read identically is a real failure.

**What changes**:

- Lines (Combined mode): add `stroke-dasharray` — melody solid, inner dashed (`6 3`),
  bass dotted (`1.5 3`) on the three `<path>`s. With `vector-effect="non-scaling-stroke"`
  already set, dashes stay uniform at any zoom. Redundant with color, zero data changes.
- Voices: swap `VOICE_COLORS` toward an Okabe-Ito-derived set tuned for the stone-800
  background, e.g. `['#e69f00', '#56b4e9', '#009e73', '#f0e442']` (orange / sky blue /
  green / yellow) — all four pairwise distinct under deuteranopia and protanopia, all
  luminous enough on dark. Keep the melody/inner/bass line trio aligned with the first
  three so Combined and Voices agree on "top voice = orange."
- The legend dots in the Combined controls bar (`text-orange-400` etc.) must move in
  lockstep — they're currently hardcoded separately from the SVG strokes, which is
  already a latent drift bug; hoist the three colors into one constant next to
  `VOICE_COLORS`.

### 6. Onset tick layer from the already-plumbed `raw.onsets`

**Why it helps**: transcription is half pitch, half rhythm. Onset marks answer "did that
note re-attack or sustain?" — the classic trap with repeated notes and ties. The data is
literally already in the component (`export let raw` includes `onsets`) and never drawn.

**What changes**: pool `raw.onsets` to `TARGET_FRAMES` columns the same way
`maxPoolRows` pools frames (or just take per-column max over all 88 pitches for a 1-D
strip). Render as a thin (~6px) strip pinned above the bottom time ruler — a per-column
brightness bar, or small triangles where the pooled value clears
`DEFAULT_NOTE_SETTINGS.onsetThresh`. Alternatively draw faint full-height vertical lines
at strong onsets, like Sonic Visualiser's time-instants layer. Requires exporting
`maxPoolRows` (or a 1-D variant) from `pitchgram.ts`.

### 7. Shade the flag → playhead region

**Why it helps**: the app's core loop is "flag the phrase start, listen, rewind to flag,
repeat." The two 1px lines (red `bg-red-400` flag, white playhead) don't show the _span_
being studied; a translucent fill between them makes the working phrase a visible object,
like a DAW loop-brace.

**What changes**: one absolutely positioned div next to the existing flag/playhead divs:
`left: min(flag, currentTime)/duration %`, width from the difference, something like
`bg-white/5`. Three lines of markup.

### 8. Harmonic cursor (ghost lines at harmonics of the hovered pitch)

**Why it helps**: the most common heatmap misreading is calling a harmonic a note — a
bright row an octave or a twelfth above the bass that isn't actually being played.
Sonic Visualiser's harmonic cursor solves exactly this. Hover a row, see its overtone
rows flagged, and you can immediately discount them.

**What changes**: the bin offsets are already computed in `pitchgram.ts` —
`HARMONICS[].offsetBins` is precisely `round(log2(h) * BINS_PER_OCTAVE)`. Export it (or
recompute the four offsets inline, it's one line), and on hover draw faint horizontal
lines at `hoveredBin + offset` in the overlay SVG. Pairs naturally with quick win #1
(same hover plumbing).

---

## Bigger swings (new data or a different rendering approach)

Ranked.

### A. Melodyne-style contour-following note blobs

**What**: in Notes/Voices modes, replace the fixed-height `SEMITONE_BINS` rects with
shapes whose vertical center per column follows the actual contour energy near the
note's pitch — i.e. for each pooled column the note spans, take the energy-weighted
centroid of `frames[x]` over the note's semitone ±1 bin (3-bin neighborhood, since
`BINS_PER_OCTAVE` is 3/semitone), and draw the note as an SVG path riding that centroid,
with thickness or opacity from the local energy. Keep a thin line at the nominal
semitone center (Melodyne's "pitch center" reference) so deviation is readable _as_
deviation.

**Why it helps transcription**: vibrato, scoops, falls, and portamento are exactly the
things a semitone-snapped rect erases and exactly the things that make vocal/string/horn
lines hard to name by ear. Seeing a blob that starts a third low and slides up tells you
"that's one note with a scoop," where today's view shows either two stacked rects or a
smeared heatmap you must interpret raw. This is the single biggest fidelity upgrade
available without touching the model — the sub-semitone data already exists in
`pooledContours`/`frames`; it's currently only rendered as heat.

**Cost**: a per-note centroid pass (cheap: notes x spanned columns x 3 bins) in
`pitchgram.ts` (natural home: extend `toRenderedNotes` or a sibling), plus path
generation in the view. Medium effort, no new model output, no worker changes.

### B. Chromagram strip + key detection, tinting the grid to the detected key

**What**: two related pieces.

1. A collapsible 12-row pitch-class strip under the main canvas: fold each `frames[x]`
   across octaves (`sum over o of frames[x][o * BINS_PER_OCTAVE + pc*3 .. +2]`), render
   with the same `pitchColor` ramp on a second small canvas sharing `canvasWidthPx` so it
   scrolls/zooms in lockstep (put it inside the same scroll container above the ruler).
2. Correlate the clip-global chroma vector against Krumhansl-Schmuckler key profiles
   (24 dot products, ~30 lines) to guess the key; then tint in-key rows in `gridStyle`
   (or bold the in-key gutter labels) and show "likely key: A major" in the toolbar.

**Why it helps transcription**: when the texture is dense, transcribers work top-down —
"it's in A, so that ambiguous cluster is probably an E-major chord" — rather than
bottom-up pitch by pitch. The chroma strip answers "what chord is sounding here" even
when octave placement in the heatmap is ambiguous, and key-tinted rows turn every
in-scale guess into a visual snap-to. Nothing in the current view supports harmonic
context at all.

**Cost**: folding + rendering is small; the subtlety is UI budget (a second strip
competes with vertical space on mobile — gate it behind a toggle or desktop-only, like
the existing `hidden lg:block` info line).

### C. Playhead "now" spectrum panel (paused-chord reader)

**What**: when paused, show a side panel (desktop) or sheet (mobile, alongside the
existing `mobileSheet` mechanism) rendering the current column
`frames[Math.floor((currentTime / duration) * frames.length)]` as horizontal bars with
note names — a magnified, labeled, vertical slice of the heatmap; effectively "what
notes are sounding at the playhead, sorted and labeled."

**Why it helps transcription**: the workflow for a hard chord is: pause on it, loop it,
pick it apart. A labeled slice turns that from "squint at a 1-column sliver of heatmap"
into a readable list — the paused state is precisely when the user has time to read
detail, and precisely when the scrolling view offers the least. Could also push the top
slice pitches onto `PianoReference` as highlighted keys, which is how a pianist would
verify a chord anyway.

**Cost**: pure view code over existing data; the design work (where it lives, how many
peaks to label) is the real cost. Peak-picking within the slice can reuse the
`LINE_THRESHOLD` idea; labeling reuses `NOTE_NAMES` math.

### D. Audition on click: hear a note rect through the existing synth

**What**: in Notes/Voices modes, tapping a rect plays its pitch using the Rhodes-style
`startNote(midi)` synth that already exists in `PianoReference.svelte` (extract it to a
shared module), at `0.35 + amplitude` gain, while also seeking to the note start
(`seek(nativeFrameToTime(note.startFrame))`).

**Why it helps transcription**: closes the see → hear → confirm loop AnthemScore and
Melodyne users rely on: the fastest way to verify "is that blob really a D4?" is to hear
the candidate against the recording. Today the user must find D4 on the piano strip
manually. Interaction conflict to solve: the canvas click currently seeks
(`onPointerUp` → `seekFromEvent`), so note rects need `pointer-events: auto` on the SVG
rects (the SVG is `pointer-events-none` today) and a `stopPropagation`.

**Cost**: small-medium; mostly extracting the synth (`startNote`, `HARMONICS`, lazy
`AudioContext`) into e.g. `src/routes/keySynth.ts` and wiring rect events.

### E. Waveform/energy lane above the time ruler

**What**: a short (~24px) amplitude-envelope lane sharing the scroll container — min/max
peaks per pooled column, computed once from the same mono `samples` in
`LocalAudio.svelte` before they're discarded, passed alongside `frames`.

**Why it helps transcription**: phrase boundaries, rests, and section changes read
instantly from a waveform and very poorly from a pitch heatmap; it's the map the user
scrubs by. Every DAW pairs the two for this reason. It also gives the FFT-analyzer path
(which has no `raw`/onsets) a rhythm reference.

**Cost**: new data through the `ready`/props chain (`LocalAudio` → `+page.svelte` →
`PitchgramView`), a small peaks computation (`~frames.length` columns x min/max), one
more canvas. Touches three files, hence not a quick win.

### F. Voice-line ribbons instead of rect streams (Voices mode)

**What**: render each voice stream as a connected ribbon — notes joined by thin
connecting segments across gaps below some duration — rather than disconnected rects.
Optionally merge with idea A so each ribbon rides the contour.

**Why it helps transcription**: following a middle voice through a texture is the hardest
by-ear task; `groupIntoVoices` already builds genuinely monophonic streams, but
same-height scattered rects still make the eye re-acquire the voice after every rest.
A continuous ribbon is what makes "follow one voice with your eye while listening" work —
it exploits the streams' monophony guarantee, which the current rendering doesn't
visually communicate at all.

**Cost**: pure view code over `voiceStreams` (one `<path>` per voice plus per-note
opacity segments); the design nuance is not fabricating continuity across long gaps —
cap connector length at something like `VOICE_GAP_CAP_FRAMES`.

### G. Not recommended (considered and rejected)

- **Staff-notation pane (AnthemScore-style)**: huge rendering dependency (VexFlow etc.),
  and the app's premise is transcription _by the human_ — notation output competes with
  the product instead of aiding it. A MIDI-file export of `notes` would deliver most of
  the value for ~50 lines if ever wanted, but it's not visualization.
- **3D/animated spectral effects, particle playheads**: decorative; the existing
  follow-playhead scroll already provides the motion cue that matters.
- **Per-voice stems/flags or rhythm quantization display**: requires a tempo/beat model
  the pipeline doesn't have; onset ticks (quick win #6) deliver the rhythm signal
  without pretending to know the meter.

---

## Suggested order

1. Quick wins #1, #2, #4 together — one afternoon, and they compound (hover readout +
   lane shading + dimmed underlay make every existing mode more legible).
2. Quick wins #3 + #7 — playhead-coupled feedback, the "transcribing while listening"
   loop.
3. Quick win #5 (palette + dashes) — small, but do it before Voices mode gets more
   prominent.
4. Bigger swing A (contour blobs), then F (ribbons) as its natural continuation.
5. B (chroma/key) when harmonic-context features feel worth the vertical space.
