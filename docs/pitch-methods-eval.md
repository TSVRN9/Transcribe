# Pitch methods: measured on annotated audio

`docs/research-pitch-extraction.md` was desk research; nothing in it was measured. This doc
replaces its verdicts wherever the numbers below disagree (see [Contradicted claims](#contradicted-claims)).
Everything here was scored with `mir_eval` 0.8.2 on real annotated recordings, running the actual
TypeScript under Node 25.

## Recommendations, ranked

1. **Melody and bass lines: switch from per-band argmax to skyline / lowest note** (`noteLine` in
   `src/routes/pitch/lines.ts`). Melody = highest note with basic-pitch frame probability ≥ 0.3
   anywhere in C2..B6. Bass = lowest note ≥ 0.3. This is the largest gain measured: on four-voice
   Bach, melody RPA goes from 0.47 to 0.77 and bass from 0.59 to 0.89. Every polyphonic set improves.
   It costs nothing extra because it reads the same `frames` array. Caveat: the reference melody in
   these sets is the top voice. Pop material with accompaniment above the vocal was not available to
   test (MedleyDB is gated).
2. **Cents-precision lines from contours** (`refineMidi`). Same data, about 20 lines of code. On
   vocals, RPA within 20 cents goes from 0.39 (semitone-quantised, shipped) to 0.81.
   - basic-pitch's contour bin `3s+1` is the centre of semitone `s`, not bin `3s`. This was
     measured against exact f0 on Bach10-mf0-synth.
   - The shipped heatmap already renders it this way. basic-pitch's own `midiPitchToContourBin`
     (used only for its pitch bends, which this app ignores) is off by a third of a semitone.
3. **Note segmentation default: `onsetThresh` 0.5 → 0.6.** Onset F1 improves on all five sets, held out or not. Keep `frameThresh` 0.3, `minNoteLen` 5,
   `inferOnsets` true and `melodiaTrick` off. Melodia lowers F1 and runs 5-10x slower.
4. **Key from basic-pitch `frames`** (`estimateKey` in `src/routes/pitch/rhythmKey.ts`, ~40 lines,
   0 bytes). Krumhansl-Kessler profiles over a chroma built only from frame probabilities ≥ 0.3.
   On 30 GuitarSet excerpts the mir_eval weighted score is 0.95, with 28 of 30 exact. A chroma built
   from contours scores only 0.54 because harmonic bleed pulls the estimate to the dominant.
5. **CREPE-tiny as an opt-in "precise line" for monophonic material** (`src/routes/pitch/crepe.ts`).
   It is the most accurate mono f0 tracker measured. On vocals it scores RPA50 0.98 and RPA20 0.93,
   against 0.93 / 0.81 for the free basic-pitch line. Costs:
   - a 1.96 MB model (MIT);
   - about 0.5 s of compute per audio second on tfjs-wasm, with 10 ms hop, on a loaded machine;
   - shipping it needs `@tensorflow/tfjs` as a direct dependency (see [Integration notes](#integration-notes)).
6. **Beat grid** (`estimateBeats`). It works about as well as librosa's `beat_track` on the same
   tracks: beat F 0.51 vs 0.49 mean over 30 GuitarSet excerpts. Tempo is right for about 2 of 3
   excerpts; the rest are mostly off by 3:2 or 2:3 (swing and compound metre). Ship it only with a
   ×2 / ÷2 / ×3⁄2 tempo correction, or tap-to-set.
7. **pYIN in TypeScript** (`pyin` in `src/routes/pitch/f0.ts`). Use it as the zero-download mono
   tracker for the FFT analyzer, or when the model is unavailable. It matches librosa's pYIN to within
   0.006 OA and runs about 3x faster. It is a fallback only: the basic-pitch line beats it on vocals,
   and so does CREPE.

Do not do:

- Do not use Viterbi/HMM smoothing on the line picks: it does not beat the existing 5-frame median.
- Do not switch the heatmap to percentile normalisation: it makes thresholds less stable across clips.
- Do not develop the FFT analyzer further. Klapuri's estimate-and-cancel does not close the gap to
  basic-pitch.
- Do not ship SPICE: 8.76 MB, worse than CREPE, and it does not run on tfjs-wasm.

## Data

All downloads went to a scratch directory, never the repo. Pass paths to the harness.

| Set               | Source                                                                                                                                                                                             | Used                                                                                                                       | Task                                                       | Licence         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- |
| vocadito          | https://zenodo.org/records/5578807 (`vocadito.zip`, 58 MB)                                                                                                                                         | all 40 solo-vocal tracks                                                                                                   | mono f0, notes (annotator A1)                              | CC BY 4.0       |
| Bach10-mf0-synth  | https://zenodo.org/records/1481156 (127 MB)                                                                                                                                                        | 10 mixes; 12 stems (pieces 01-03 × 4 instruments)                                                                          | multi-f0, melody (top voice), bass, mono f0 (stems), exact | CC BY-NC 4.0    |
| GuitarSet         | https://zenodo.org/records/3371780: `annotation.zip` (39 MB) + 30 `*_mic.wav` pulled individually out of `audio_mono-mic.zip` (657 MB) with HTTP range requests (`eval-pitch.py fetch` lists them) | 8 tracks (comp + solo, players 00-05) for every task; 22 more distinct comp excerpts (`guitarset-x`) for beats, key, notes | notes, multi-f0 (string contours), beats, tempo, key       | CC BY 4.0       |
| MAESTRO v3 (test) | https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.zip, range-fetched: 3 shortest test-split performances, first 60 s each                                          | 3 tracks                                                                                                                   | notes (sustain-pedal-extended offsets), multi-f0           | CC BY-NC-SA 4.0 |
| TRIOS             | https://zenodo.org/records/6797837 (93 MB)                                                                                                                                                         | 5 mixes (brahms, lussier, mozart, schubert, take_five; drums excluded from refs)                                           | notes, multi-f0                                            | per Zenodo      |
| synthetic         | `scripts/bench-pitchgram.js`                                                                                                                                                                       | sanity check only                                                                                                          |                                                            |                 |

Skipped:

- **MDB-stem-synth**: a single 1.8 GB tar.gz with no per-track access.
- **URMP**: about 12 GB, and the per-track host was not found on Zenodo.
- **MedleyDB / iKala**: gated.
- **Whole MAESTRO and MusicNet**: excluded by brief.
- **SWIPE′**: not implemented. The four classical trackers that were built land within 0.015 RPA
  of each other on vocals, and all are well behind the model-based lines, so a fifth was not worth
  the time.
- **CREPE small/medium/full**: no tf.js conversion of these was found. Only the web demo's tiny
  model resolves (marl gh-pages and the identical ml5 copy). Converting the Keras weights is
  possible, but every size above tiny is 6-90 MB.
- **PESTO**: not run. Its weights are LGPL and it needs a PyTorch or ONNX runtime, so it could not
  ship.

**Training overlap, read before trusting a number.**

- The basic-pitch paper (Bittner et al., ICASSP 2022, arXiv 2203.09893, Table 1) trains on
  GuitarSet, MAESTRO, Slakh, iKala and MedleyDB.
  - It tests on half of GuitarSet and on the MAESTRO test split. Which GuitarSet half is not stated,
    so treat the GuitarSet scores as possibly trained-on.
  - The three MAESTRO tracks here come from the official test split, so they are held out.
  - vocadito (2021), Bach10-mf0-synth and TRIOS are not in the paper's list: held out.
- marl/crepe's README lists the released models' training data as MIR-1K, Bach10, RWC-Synth,
  MedleyDB, MDB-STEM-Synth and NSynth.
  - CREPE's Bach10-stem row is therefore optimistic.
  - The web demo's tiny model is undocumented; assume the same data.
- vocadito is held out for every model here.

**Reference conventions.**

- Polyphonic "melody" and "bass" references are the highest and lowest sounding f0 per 10 ms frame
  of the multi-f0 reference.
- f0 metrics use the voicing threshold that maximises mean OA for that set; the threshold is shown.
  RPA does not depend on it.

## Results

Speeds are ms of compute per second of audio, single-threaded Node 25. The box was a shared 8-core
machine at load average ~20, so read speeds as ratios between methods, not absolute numbers. Model
methods ran on tfjs-wasm 3.21. The tfjs-cpu backend, which Node uses by default, measured
~2070 ms/s for basic-pitch, slower than real time. The browser's WebGL backend was not measured.

### 1. Monophonic f0

Held-out vocals (vocadito, 40 tracks), plus exact-f0 instrument stems (Bach10-mf0-synth, 12 stems).
"Octave" = RCA − RPA (chroma right, octave wrong). "|cents|" is the median absolute error over
frames already within 50 cents.

| method                                                          | vocadito RPA50 | RPA20     | octave | \|cents\| | OA (thr)         | stems RPA50 / RPA20 | ms per audio-s                       | bytes shipped |
| --------------------------------------------------------------- | -------------- | --------- | ------ | --------- | ---------------- | ------------------- | ------------------------------------ | ------------- |
| CREPE-tiny (`crepe.ts` + tf.js)                                 | **0.980**      | **0.926** | 0.005  | **4.2**   | **0.916** (0.65) | 0.988 / 0.971 ¹     | 474 (wasm)                           | 1,964,037     |
| bp-line: `noteLine(frames, contours, 'max', {threshold: 0.15})` | 0.927          | 0.807     | 0.002  | 6.8       | 0.864 (0.35)     | 0.975 / 0.951       | ~0 on top of basic-pitch (124, wasm) | 0 extra       |
| pYIN (`f0.ts`)                                                  | 0.930          | 0.776     | 0.003  | 7.3       | 0.852 (0.1)      | 0.968 / 0.930       | 37                                   | 0             |
| librosa pYIN (oracle)                                           | 0.930          | 0.772     | 0.001  | 7.7       | 0.858 (0.05)     | 0.969 / 0.930       | 107 (Python)                         | n/a           |
| MPM (experiments)                                               | 0.924          | 0.772     | 0.007  | 7.3       | 0.851 (0.8)      | 0.961 / 0.924       | 22                                   | 0             |
| HPS (experiments)                                               | 0.919          | 0.823     | 0.023  | 5.3       | 0.849 (0.35)     | 0.952 / 0.930       | 13                                   | 0             |
| YIN (`f0.ts`)                                                   | 0.918          | 0.766     | 0.011  | 7.3       | 0.845 (0.8)      | 0.959 / 0.924       | 20                                   | 0             |
| librosa YIN (oracle, no voicing)                                | 0.920          | 0.767     | 0.010  | 7.4       | n/a              | 0.963 / 0.926       | 21 (Python)                          | n/a           |
| bp-shipped pick, full range, semitone (no refine)               | 0.828          | 0.389     | 0.002  | 21.4      | 0.810 (0.35)     | 0.957 / 0.690       | ~0                                   | 0             |
| bp-shipped-melband: the UI's melody line today (band ≥ C4)      | 0.262          | 0.120     | 0.166  | 23.2      | 0.495 (0.3)      | 0.615 / 0.442       | ~0                                   | 0             |
| FFT analyzer (`computePitchgram` + `extractLines`)              | 0.274          | 0.200     | 0.443  | 15.0      | 0.467 (0.55)     | 0.616 / 0.540       | 36                                   | 0             |

¹ CREPE trained on Bach10, so the stems column is optimistic for CREPE.

- `bp-line` = `noteLine(frames, contours, 'max', { threshold: 0.15 })`, the shipped full-range
  argmax + median with contour refinement. The "no refine" row is the same pick snapped to the
  semitone grid.
- `bp-shipped-melband` is the shipped melody band (C4 and up only). It misses most male vocals
  (RPA 0.26) because the band starts at C4.
- `yin`/`pyin` started out 8 points below librosa. The cause was the classic half-frame YIN window,
  which reads about 20 ms early on glides. With a centred type-II difference (as librosa 1.0 uses),
  they match librosa to within 0.01 RPA.
- `inner` lines were not evaluated: no reference defines an inner voice.
- On full mixes, every classical tracker (YIN, pYIN, MPM, HPS) scores melody RPA ≤ 0.13 on Bach10,
  TRIOS and MAESTRO (≤ 0.53 on GuitarSet). Do not run them on mixes.

**SPICE**, measured on 10 vocadito tracks only (tfjs-cpu, ~2.7 s of compute per audio second).
Same 10 tracks for every row:

| method     | RPA50 | RPA20 | \|cents\| | OA (thr)     | VR / VFA    |
| ---------- | ----- | ----- | --------- | ------------ | ----------- |
| CREPE-tiny | 0.986 | 0.938 | 4.0       | 0.926 (0.65) | 0.95 / 0.14 |
| SPICE      | 0.954 | 0.815 | 8.2       | 0.830 (0.85) | 0.96 / 0.39 |
| bp-line    | 0.927 | 0.814 | 6.5       | 0.875 (0.3)  | 0.94 / 0.17 |
| pYIN       | 0.929 | 0.784 | 7.0       | 0.857 (0.1)  | 0.93 / 0.22 |

- SPICE's time alignment was checked with a ±64 ms lag scan; it peaks at 0.
- Its `1 − uncertainty` makes a poor voicing signal.
- It is 4.5x CREPE-tiny's size and worse on every column.
- The first SPICE run read the graph's outputs in the wrong order; `executeAsync(..., ['pitch', 'uncertainty'])` fixed it.

### 2. Melody and bass lines in mixes (RPA50 / best OA)

| method                                     | Bach10 mel      | GuitarSet mel   | TRIOS mel       | MAESTRO mel     | Bach10 bass     | GuitarSet bass  | TRIOS bass      | MAESTRO bass    |
| ------------------------------------------ | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| bp-shipped (band argmax, median)           | 0.47 / 0.48     | 0.48 / 0.51     | 0.39 / 0.43     | 0.33 / 0.30     | 0.58 / 0.59     | 0.43 / 0.50     | 0.43 / 0.46     | 0.36 / 0.39     |
| bp-shipped + contour refine                | 0.47 / 0.49     | 0.49 / 0.51     | 0.39 / 0.43     | 0.33 / 0.30     | 0.59 / 0.60     | 0.43 / 0.50     | 0.43 / 0.46     | 0.36 / 0.39     |
| bp-viterbi (frames) + refine               | 0.47 / 0.49     | 0.48 / 0.52     | 0.35 / 0.40     | 0.29 / 0.28     | 0.58 / 0.59     | 0.43 / 0.51     | 0.38 / 0.44     | 0.33 / 0.39     |
| bp-viterbi over contours (3 bins/semitone) | 0.58 / 0.60     | 0.45 / 0.52     | 0.33 / 0.38     | 0.22 / 0.26     | 0.59 / 0.60     | 0.42 / 0.52     | 0.32 / 0.38     | 0.29 / 0.38     |
| **noteLine skyline/lowest, thr 0.3**       | **0.77 / 0.77** | **0.73 / 0.69** | **0.55 / 0.58** | **0.42 / 0.37** | **0.89 / 0.89** | **0.75 / 0.72** | **0.50 / 0.54** | **0.57 / 0.50** |
| noteLine skyline/lowest, thr 0.5           | 0.76 / 0.76     | 0.76 / 0.74     | 0.43 / 0.48     | 0.34 / 0.34     | 0.77 / 0.78     | 0.74 / 0.73     | 0.33 / 0.40     | 0.44 / 0.42     |
| Klapuri top / bottom f0                    | 0.21 / 0.24     | 0.32 / 0.26     | 0.34 / 0.36     | 0.32 / 0.28     | 0.25 / 0.27     | 0.63 / 0.51     | 0.20 / 0.24     | 0.38 / 0.33     |
| FFT analyzer (shipped bands)               | 0.26 / 0.28     | 0.46 / 0.46     | 0.17 / 0.23     | 0.11 / 0.17     | 0.75 / 0.76     | 0.30 / 0.32     | 0.45 / 0.47     | 0.30 / 0.32     |
| pYIN on the mix                            | 0.02 / 0.05     | 0.46 / 0.47     | 0.08 / 0.16     | 0.07 / 0.17     | n/a             | n/a             | n/a             | n/a             |

- `bp-shipped` is per-band argmax with threshold 0.15 and a 5-frame median (`@5999115`).
- `bp-viterbi` is an L1-jump HMM over `frames` with a silence state. Six parameter settings were
  tried (`VITERBI` env); none beat the median filter by more than 0.02 anywhere.
- `bp-skyline0.3` is `noteLine(frames, contours, 'top' | 'bottom', { threshold: 0.3 })`.
  Threshold 0.5 is better for the GuitarSet melody but worse everywhere else.
- `klapuri` and `fft-shipped` are the FFT-path lines.

### 3. Note transcription (basic-pitch `outputToNotesPoly`), onset F1 / F1 with offsets

Sweep: onset {0.3..0.7} × frame {0.2..0.5} × minNoteLen {5, 11} × inferOnsets {on, off}, which is 80
configurations. Melodia was tried on the finalists only.

| config (onset / frame / minLen / infer / melodia) | vocadito ²        | TRIOS ²           | GuitarSet         | GuitarSet-x       | MAESTRO           |
| ------------------------------------------------- | ----------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| 0.5 / 0.3 / 5 / on / off (**current default**)    | 0.507 / 0.294     | 0.687 / 0.243     | 0.793 / 0.565     | 0.704 / 0.424     | 0.799 / 0.285     |
| **0.6 / 0.3 / 5 / on / off (recommended)**        | **0.557 / 0.364** | **0.699 / 0.274** | **0.814 / 0.592** | **0.717 / 0.440** | **0.816 / 0.296** |
| 0.55 / 0.3 / 5 / on / off                         | 0.531 / 0.324     | 0.700 / 0.265     | 0.799 / 0.579     | 0.713 / 0.435     | 0.813 / 0.292     |
| 0.65 / 0.3 / 5 / on / off                         | 0.569 / 0.391     | 0.682 / 0.277     | 0.817 / 0.599     | 0.710 / 0.440     | 0.815 / 0.293     |
| 0.6 / 0.4 / 5 / on / off                          | 0.561 / 0.372     | 0.694 / 0.243     | 0.831 / 0.609     | n/a               | 0.786 / 0.315     |
| 0.5 / 0.3 / 11 / on / off (Python default length) | 0.484 / 0.304     | 0.649 / 0.249     | 0.784 / 0.545     | n/a               | 0.674 / 0.221     |
| 0.5 / 0.3 / 5 / on / **melodia on**               | 0.495 / 0.285     | 0.666 / 0.236     | 0.775 / 0.549     | 0.691 / 0.411     | 0.783 / 0.279     |
| 0.6 / 0.3 / 5 / on / **melodia on**               | 0.538 / 0.351     | 0.687 / 0.269     | 0.793 / 0.570     | 0.703 / 0.419     | 0.799 / 0.288     |

² held out from basic-pitch training (MAESTRO tracks are test-split too). MAESTRO with-offset F1 is low for every config because the
reference offsets are pedal-extended.

- Onset 0.6 ranks first of the 80 on the vocadito + TRIOS mean, and first on the GuitarSet +
  MAESTRO mean. The current 0.5 ranks 19th of 80 on vocadito + TRIOS.
- 0.55 and 0.65 land within 0.01 of 0.6.
- `inferOnsets` changes F1 by < 0.005.
- `minNoteLen` 11 (the Python package's 127 ms default) is worse everywhere.
- Segmentation costs ~1-2 ms/s without melodia and ~10 ms/s with it.

### 4. Multipitch (mir_eval accuracy)

| method                                       | Bach10    | GuitarSet | TRIOS     | MAESTRO   | ms per audio-s |
| -------------------------------------------- | --------- | --------- | --------- | --------- | -------------- |
| basic-pitch frames ≥ 0.3                     | **0.789** | 0.640     | **0.512** | **0.455** | 0 extra        |
| basic-pitch frames ≥ 0.4                     | 0.781     | 0.677     | 0.448     | 0.403     | 0 extra        |
| basic-pitch notes (current default settings) | 0.776     | **0.683** | 0.483     | 0.444     | ~1.5           |
| Klapuri 2006 (experiments)                   | 0.457     | 0.282     | 0.327     | 0.327     | 191            |
| FFT analyzer (3 band peaks, shipped)         | 0.421     | 0.297     | 0.289     | 0.199     | 36             |

- basic-pitch frame probabilities ≥ 0.3 are the best frame-level multi-f0 measured. They roughly
  double the FFT analyzer's accuracy.
- Klapuri 2006 (whitening, harmonic-amplitude summation, iterative cancellation, polyphony stop)
  edges out the shipped 3-band FFT peaks on Bach10, MAESTRO and TRIOS, and loses on GuitarSet.
  - This version deviates from the paper in two ways. The cancelled partials are scaled by
    g(m)/g(1), so the fundamental is fully removed. Candidates within a semitone of an
    already-detected f0 are excluded.
  - The paper-faithful cancellation re-detected the same f0 three times on a synthetic C3+G3+E4
    chord. With the changes, it returns exactly the three notes.
  - Its voicing is always on: false alarm is 0.98 on GuitarSet at a −40 dB gate.
  - It costs ~190 ms/s.
  - It is not worth shipping; code is in `scripts/pitch-experiments.ts`.

### 5. Heatmap normalisation (basic-pitch contours, C2..B6, semitone-pooled)

The test treats "pixel ≥ τ" as a detector against the multi-f0 reference on 26 polyphonic tracks
(the `norm` phase). It reports each track's best τ, and their spread.

| divisor              | best-τ mean ± sd | F1 at the single best global τ | F1 at τ = 0.2 | per-track divisor range |
| -------------------- | ---------------- | ------------------------------ | ------------- | ----------------------- |
| global max (shipped) | 0.33 ± 0.06      | 0.681 (τ 0.3)                  | 0.582         | 0.77 - 0.96             |
| 99th percentile      | 0.52 ± 0.14      | 0.669 (τ 0.5)                  | 0.315         | 0.38 - 0.78             |
| 99.5th percentile    | 0.43 ± 0.07      | 0.688 (τ 0.4)                  | 0.437         | 0.53 - 0.83             |
| none (raw sigmoid)   | 0.30 ± 0.07      | 0.678 (τ 0.3)                  | 0.622         | 1                       |

- The 99th percentile more than doubles the spread of the best threshold across clips. The
  percentile tracks note density, not loudness: a sparse solo has a low p99 and a dense piano piece
  a high one.
- The global max is already stable, because basic-pitch's peak confidence sits in a narrow 0.77-0.96
  band on every clip.
- Keep the max, or drop normalisation entirely.
- If the max is kept, `OCCUPIED_THRESHOLD` = 0.2 is too low for "a note is here". The best τ is about
  0.3.

### 6. Beat, tempo, key (GuitarSet; `guitarset` = 8 tracks, `guitarset-x` = 22 more)

| method                                                | beat F (gs / gs-x) | CMLt          | AMLt          | tempo Acc1 / Acc2 (gs / gs-x) | key weighted (gs / gs-x) |
| ----------------------------------------------------- | ------------------ | ------------- | ------------- | ----------------------------- | ------------------------ |
| `estimateBeats` / `estimateKey`                       | 0.381 / 0.561      | 0.329 / 0.453 | 0.723 / 0.616 | 0.75 / 0.88, 0.64 / 0.68      | **0.912 / 0.968**        |
| librosa `beat_track` (oracle)                         | 0.289 / 0.567      | 0.220 / 0.461 | 0.500 / 0.554 | 0.63 / 0.75, 0.59 / 0.64      | n/a                      |
| first version (summed onsets, 1 lag; contours chroma) | 0.309 / 0.561      | 0.255 / 0.414 | 0.582 / 0.495 | 0.63 / 0.63, 0.50 / 0.55      | 0.438 / 0.559            |

Means over all 30: beat F 0.51 vs librosa 0.49; tempo Acc1 0.67; key 0.95 (28/30 exact). Both
take < 0.5 ms per audio second on top of basic-pitch.

- Beat-tracker variants were tried on all 30 tracks:
  - novelty from summed onsets, max onsets, frame flux, or onsets + flux;
  - autocorrelation tempo scored at 1, 2 or 4 lag multiples;
  - a tempo prior σ of 0.5 or 1 octave.
- The shipped combination (max onsets, 4 multiples, σ 1) gave the best tempo accuracy, 0.67.
- A constant shift of the beats does not help (F is flat within ±20 ms), so the remaining errors
  are metrical level, not latency.
- Key variants tried: {contours, frames, frames ≥ 0.3, bass-weighted} × {Krumhansl-Kessler,
  Temperley, Albrecht-Shanahan}. Frames ≥ 0.3 with KK was best; contours were worst with every
  profile.
- The winners were chosen on these same 30 tracks, but the margins (0.95 vs 0.54 for key) are far
  larger than the selection could explain.

### 7. Neural f0 artifacts on tf.js

| model             | artifact                                                                                                                                                                           | bytes     | licence                                                  | runs on tfjs-wasm 3.21                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| CREPE tiny        | https://marl.github.io/crepe/model/model.json + 13 shards (same files as ml5's `pitch-detection/crepe`). Keras layers model, input [n,1024] @16 kHz                                | 1,964,037 | MIT (marl/crepe repo, GitHub API)                        | yes                                                          |
| SPICE v2          | https://tfhub.dev/google/tfjs-model/spice/2/default/1/model.json?tfjs-format=file redirects to a signed, expiring Kaggle storage URL. Graph model, input 16 kHz samples, 32 ms hop | 8,763,115 | Apache-2.0 per TF Hub; not re-checked on the Kaggle page | no: needs the `Complex`/FFT kernels; ran on tfjs-cpu instead |
| basic-pitch (ref) | `static/basic-pitch-model`                                                                                                                                                         | 916,929   | Apache-2.0                                               | yes, with a patched `Fill` kernel (harness only)             |

## Contradicted claims

From `docs/research-pitch-extraction.md`:

- **§3.1, "CREPE: the browser-viable variant is explicitly the degraded one. Accuracy story
  evaporates at browser size."** The tiny model is the most accurate tracker measured on held-out
  vocals: RPA50 0.98, against 0.93 for pYIN and 0.93 for the basic-pitch line.
- **§3.1, "SPICE: the cheapest one to try."** It is 4.5x CREPE-tiny's size, the URL is an expiring
  signed redirect, and it cannot run on the wasm backend. It also scores below CREPE-tiny on every metric (§1, 10-track subset).
- **§3.1, "do not add a monophonic tracker yet; cents-level f0 is a feature nobody asked for."** No
  new tracker is needed for cents-level lines: refining the existing basic-pitch line with its own
  contours gets 0.81 RPA20 on vocals for free.
- **§3.6 Finding 1 / §4 "If you do one thing": "replace the single `globalMax` with a ~99th
  percentile."** Measured worse (§5 above): the p99 doubles the cross-clip spread of the right
  threshold. Keep the max.
- **§3.5, "a beat/bar grid is plausibly worth more than any accuracy improvement."** The textbook
  tracker built from `raw.onsets` matches librosa. Even so, tempo is wrong about 1 time in 3 on solo
  guitar, so it needs a user correction control to be usable.
- **`pitchgram.ts` `melodiaTrick` comment ("about 19% more notes").** Melodia does add notes, but F1
  drops on every set. Keep it off.

Confirmed:

- basic-pitch is the right core model: it dominates multi-f0 and polyphonic lines.
- Do not invest in the FFT analyzer.
- Do not ship PESTO.

## Integration notes

New modules are pure TypeScript with no DOM and no Node APIs. Each has a DEV-only `console.assert`
self-check.

- `src/routes/pitch/lines.ts`
  - `noteLine(noteFrames, contours | null, 'top' | 'bottom' | 'max', { threshold?, loMidi = 36, hiMidi = 96 }) → ({ midi, score } | null)[]`
    - one entry per native basic-pitch frame (~86 fps); map frames to time with `nativeFrameToTime`;
    - `midi` is fractional when contours are passed;
    - defaults: melody `'top'` with 0.3, bass `'bottom'` with 0.3, monophonic `'max'` with 0.15;
    - feed it the unpooled `raw.frames` and contours, not the 2400-column pooled grid.
    - The UI confidence slider's default of 0.4 costs 0.02-0.06 OA on these lines against 0.3.
      For example, Bach10 melody is 0.73 at 0.4 and 0.77 at 0.3. Default the slider to 0.3.
  - `refineMidi(contourRow, midi)`
  - `CONTOUR_BIN0_MIDI` (= 20.667)
- `src/routes/pitch/f0.ts`
  - `pyin(samples, sampleRate, { hop?, fmin = 50, fmax = 2000, frameSize? }) → { timeSec, midi, confidence }[]`
    - Float32Array mono, any sample rate;
    - default hop ≈ 11.6 ms;
    - `confidence` is 0 on HMM-unvoiced frames, so treat > 0 as voiced; OA is best at ≥ 0.1;
    - Viterbi back-pointers take `frames × 2 × 639 × 2` bytes, about 130 MB for 10 minutes, so
      chunk long files or lower `fmax`.
  - `yin(...)`: same signature plus `threshold`.
- `src/routes/pitch/crepe.ts`
  - `crepeBatch(samples16k, hop, start, count) → Float32Array [count × 1024]`
  - `crepeDecode(activations, hop, start) → F0Frame[]`
  - `CREPE_SAMPLE_RATE = 16000`
  - The caller resamples to 16 kHz (for example with an `OfflineAudioContext` at 16000) and runs
    `model.predict` (`tf.loadLayersModel`).
  - Voicing: `confidence ≥ 0.5` (OA is best at 0.4-0.65).
  - Getting `tf` needs `@tensorflow/tfjs` as a direct dependency. It is already in the bundle through
    basic-pitch; pnpm's strict layout just hides it from `src/`. Pin it to the same 3.21.0 and it adds
    no bytes.
  - Batches of 512 frames.
- `src/routes/pitch/rhythmKey.ts`
  - `estimateBeats(onsetStrength, fps) → { bpm, beatFrames }`
    - `onsetStrength[i]` = max over pitches of `raw.onsets[i]`, with `fps = 22050 / 256`;
    - `beatFrames` are native frame indices, converted with `nativeFrameToTime`.
  - `estimateKey(raw.frames) → "Eb major"`

## Reproduce

```sh
S=/path/to/scratch            # never inside the repo
python3 -m venv $S/venv && $S/venv/bin/pip install mir_eval pretty_midi librosa
$S/venv/bin/python -I scripts/eval-pitch.py fetch $S/data $S/models   # sets + CREPE/SPICE, ~420 MB
$S/venv/bin/python -I scripts/eval-pitch.py prep $S/data $S/out
# fast tf.js backend for the model phases (scratch install, not a project dependency)
(mkdir $S/node && cd $S/node && npm init -y && npm i @spotify/basic-pitch@1.0.1 @tensorflow/tfjs-backend-wasm@3.21.0)
git show 5999115:src/routes/pitchgram.ts > $S/pitchgram-head.ts   # FFT-path baseline as of this eval
node scripts/eval-pitch.js $S/out classical
node scripts/eval-pitch.js $S/out bp --tfjs-root $S/node          # caches basic-pitch outputs
for p in bpnotes bplines bpmf0 norm beatkey klapuri; do node scripts/eval-pitch.js $S/out $p; done
node scripts/eval-pitch.js $S/out fft --pitchgram $S/pitchgram-head.ts
node scripts/eval-pitch.js $S/out crepe --models $S/models --tfjs-root $S/node
ONLY=vocadito_1,vocadito_10,vocadito_11,vocadito_12,vocadito_13,vocadito_14,vocadito_15,vocadito_16,vocadito_17,vocadito_18 \
  node scripts/eval-pitch.js $S/out spice --models $S/models     # tfjs-cpu only, slow
$S/venv/bin/python -I scripts/eval-pitch.py librosa $S/out      # librosa yin/pyin/beat_track oracles
$S/venv/bin/python -I scripts/eval-pitch.py score $S/out [METHOD...]
```

`ONLY=id,id,...` limits any phase to those tracks and skips writing `timing.json`. Env knobs:
`METHODS` (classical), `NOTE_CONFIGS` (bpnotes, JSON list), `VITERBI` (bplines, JSON),
`CREPE_HOP`.

`scripts/pitch-experiments.ts` holds the methods that lost (MPM, HPS, Viterbi line, Klapuri) so
their rows stay reproducible. Nothing under `src/` imports it.
