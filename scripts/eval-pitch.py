"""Reference prep + mir_eval scoring for scripts/eval-pitch.js. See docs/pitch-methods-eval.md.

usage (run with the venv python and -I):
  eval-pitch.py fetch DATA_DIR MODELS_DIR   # download the eval sets + CREPE/SPICE (~420 MB)
  eval-pitch.py prep DATA_DIR OUT_DIR       # build OUT_DIR/manifest.json + OUT_DIR/refs/*
  eval-pitch.py score OUT_DIR [METHOD...]   # score OUT_DIR/est/<method>/* -> OUT_DIR/scores.json
  eval-pitch.py librosa OUT_DIR             # librosa yin/pyin/beat_track oracles
"""
import glob, io, json, os, subprocess, sys, time, urllib.request, zipfile
import numpy as np

GRID = 0.01
MAESTRO_CROP = 60.0

ZENODO = 'https://zenodo.org/records'
GS_ZIP = f'{ZENODO}/3371780/files/audio_mono-mic.zip?download=1'
MAESTRO_ZIP = 'https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.zip'
GS_CORE = ['00_BN1-129-Eb_comp', '00_Funk2-108-Eb_solo', '01_Jazz1-130-D_comp', '01_Rock1-90-C#_solo',
           '02_SS2-88-F_comp', '03_BN1-147-Gb_solo', '04_Funk2-119-G_comp', '05_Jazz1-200-B_solo']
# one comp take of every other GuitarSet excerpt, rotating players
GS_EXTRA = ['01_BN2-131-B', '02_BN2-166-Ab', '03_BN3-119-G', '04_BN3-154-E', '05_Funk1-114-Ab', '00_Funk1-97-C',
            '01_Funk3-112-C#', '02_Funk3-98-A', '03_Jazz2-110-Bb', '04_Jazz2-187-F#', '05_Jazz3-137-Eb',
            '00_Jazz3-150-C', '01_Rock1-130-A', '02_Rock2-142-D', '03_Rock2-85-F', '04_Rock3-117-Bb',
            '05_Rock3-148-C', '00_SS1-100-C#', '01_SS1-68-E', '02_SS2-107-Ab', '03_SS3-84-Bb', '04_SS3-98-C']
# the three shortest MAESTRO v3 test-split performances
MAESTRO = ['2008/MIDI-Unprocessed_09_R3_2008_01-07_ORIG_MID--AUDIO_09_R3_2008_wav--2',
           '2015/MIDI-Unprocessed_R1_D1-9-12_mid--AUDIO-from_mp3_11_R1_2015_wav--5',
           '2015/MIDI-Unprocessed_R2_D1-2-3-6-7-8-11_mid--AUDIO-from_mp3_03_R2_2015_wav--1']


class RangeFile(io.RawIOBase):
    """Seekable read-only view of a remote file over HTTP Range, so zipfile can pull single members."""

    def __init__(self, url):
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD')) as r:
            self.url, self.size = r.url, int(r.headers['Content-Length'])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size or len(b) == 0:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        req = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'})
        with urllib.request.urlopen(req) as r:
            data = r.read()
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


def zip_members(url, members, dest):
    os.makedirs(dest, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(url), buffer_size=1 << 20))
    for m in members:
        out = os.path.join(dest, os.path.basename(m))
        if not os.path.exists(out):
            with z.open(m) as src, open(out, 'wb') as dst:
                dst.write(src.read())


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        urllib.request.urlretrieve(url, dest)


def fetch(data, models):
    download(f'{ZENODO}/5578807/files/vocadito.zip?download=1', f'{data}/vocadito/vocadito.zip')
    download(f'{ZENODO}/1481156/files/Bach10-mf0-syth.tar.gz?download=1', f'{data}/bach10synth/b.tar.gz')
    download(f'{ZENODO}/6797837/files/TRIOS%20Dataset.zip?download=1', f'{data}/trios/t.zip')
    download(f'{ZENODO}/3371780/files/annotation.zip?download=1', f'{data}/guitarset/annotation.zip')
    zip_members(GS_ZIP, [f'{n}_mic.wav' for n in GS_CORE], f'{data}/guitarset')
    zip_members(GS_ZIP, [f'{n}_comp_mic.wav' for n in GS_EXTRA], f'{data}/guitarset2')
    zip_members(MAESTRO_ZIP, [f'maestro-v3.0.0/{m}.{e}' for m in MAESTRO for e in ('wav', 'midi')], f'{data}/maestro')
    # archives are untrusted: extract with the stdlib into their own directories, skipping macOS junk
    for arc, dest in ((f'{data}/vocadito/vocadito.zip', f'{data}/vocadito'), (f'{data}/trios/t.zip', f'{data}/trios'),
                      (f'{data}/guitarset/annotation.zip', f'{data}/guitarset/ann')):
        with zipfile.ZipFile(arc) as z:
            z.extractall(dest, [m for m in z.namelist() if '__MACOSX' not in m and not m.endswith('.pdf')])
    subprocess.run(['tar', 'xzf', 'b.tar.gz', '--exclude=._*'], cwd=f'{data}/bach10synth', check=True)
    crepe = 'https://marl.github.io/crepe/model'
    download(f'{crepe}/model.json', f'{models}/crepe/model.json')
    for i in range(1, 14):
        download(f'{crepe}/group{i}-shard1of1', f'{models}/crepe/group{i}-shard1of1')
    spice = 'https://tfhub.dev/google/tfjs-model/spice/2/default/1'
    download(f'{spice}/model.json?tfjs-format=file', f'{models}/spice/model.json')
    for i in (1, 2, 3):
        download(f'{spice}/group1-shard{i}of3.bin?tfjs-format=file', f'{models}/spice/group1-shard{i}of3.bin')


def hz(midi):
    return 440.0 * 2 ** ((np.asarray(midi, float) - 69) / 12)


def write_rows(path, rows):
    with open(path, 'w') as f:
        for r in rows:
            f.write(','.join(f'{v:.6f}' if isinstance(v, float) else str(v) for v in r) + '\n')


def read_rows(path):
    with open(path) as f:
        return [[float(v) for v in line.replace('\t', ',').split(',') if v.strip()] for line in f if line.strip()]


def mf0_from_notes(notes, dur):
    t = np.arange(0, dur, GRID)
    frames = [[] for _ in t]
    for on, off, f in notes:
        for i in range(int(np.ceil(on / GRID)), min(len(t), int(np.ceil(off / GRID)))):
            frames[i].append(f)
    return t, frames


def mf0_from_contours(contours, dur):
    t = np.arange(0, dur, GRID)
    frames = [[] for _ in t]
    for ct, cf in contours:
        ct, cf = np.asarray(ct), np.asarray(cf)
        idx = np.searchsorted(ct, t)
        for i, k in enumerate(idx):
            for kk in (k - 1, k):
                if 0 <= kk < len(ct) and abs(ct[kk] - t[i]) <= 0.006 and cf[kk] > 0:
                    frames[i].append(float(cf[kk]))
                    break
    return t, frames


def write_poly(out, tid, t, frames, kinds):
    write_rows(f'{out}/{tid}.mf0.csv', [[float(tt)] + [float(f) for f in fr] for tt, fr in zip(t, frames)])
    write_rows(f'{out}/{tid}.melody.csv', [[float(tt), float(max(fr)) if fr else 0.0] for tt, fr in zip(t, frames)])
    write_rows(f'{out}/{tid}.bass.csv', [[float(tt), float(min(fr)) if fr else 0.0] for tt, fr in zip(t, frames)])
    kinds += ['mf0', 'melody', 'bass']


def midi_notes(path, crop=None, pedal=True, skip=()):
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(path)
    notes = []
    for inst in pm.instruments:
        if inst.is_drum or any(s in inst.name.lower() for s in skip):
            continue
        downs = []
        if pedal:
            state, start = False, 0.0
            for cc in sorted((c for c in inst.control_changes if c.number == 64), key=lambda c: c.time):
                on = cc.value >= 64
                if on and not state:
                    start = cc.time
                elif state and not on:
                    downs.append((start, cc.time))
                state = on
        for n in inst.notes:
            off = n.end
            for a, b in downs:
                if a <= n.end < b:
                    off = b
            notes.append([n.start, off, n.pitch, n.end])
    notes.sort()
    # pedal-extended offsets stop at the next onset of the same pitch
    for i, n in enumerate(notes):
        for m in notes[i + 1:]:
            if m[2] == n[2] and m[0] < n[1]:
                n[1] = max(n[3], m[0])
                break
    out = [(on, off, float(hz(p))) for on, off, p, _ in notes]
    if crop:
        out = [(on, min(off, crop), f) for on, off, f in out if on < crop - 0.05]
    return out


def prep(data, out):
    refs = f'{out}/refs'
    os.makedirs(refs, exist_ok=True)
    manifest = []

    for wav in sorted(glob.glob(f'{data}/vocadito/Audio/*.wav')):
        tid = os.path.basename(wav)[:-4]
        ann = f'{data}/vocadito/Annotations'
        write_rows(f'{refs}/{tid}.f0.csv', read_rows(f'{ann}/F0/{tid}_f0.csv'))
        notes = [(r[0], r[0] + r[2], r[1]) for r in read_rows(f'{ann}/Notes/{tid}_notesA1.csv')]
        write_rows(f'{refs}/{tid}.notes.csv', notes)
        manifest.append(dict(id=tid, set='vocadito', audio=wav, kinds=['f0', 'notes']))

    b10 = f'{data}/bach10synth/Bach10-mf0-synth'
    for wav in sorted(glob.glob(f'{b10}/audio_stems/0[1-3]_*.wav')):
        tid = 'b10stem_' + os.path.basename(wav).replace('.RESYN.wav', '')
        write_rows(f'{refs}/{tid}.f0.csv', read_rows(wav.replace('audio_stems', 'annotation_stems').replace('.wav', '.csv')))
        manifest.append(dict(id=tid, set='bach10-stem', audio=wav, kinds=['f0']))
    for wav in sorted(glob.glob(f'{b10}/audio_mix/*.wav')):
        tid = 'b10mix_' + os.path.basename(wav)[:2]
        rows = read_rows(wav.replace('audio_mix', 'annotation_mf0').replace('.wav', '.csv'))
        kinds = []
        write_poly(refs, tid, [r[0] for r in rows], [[f for f in r[1:] if f > 0] for r in rows], kinds)
        manifest.append(dict(id=tid, set='bach10-mix', audio=wav, kinds=kinds))

    gs = [(w, 'guitarset') for w in sorted(glob.glob(f'{data}/guitarset/*_mic.wav'))]
    gs += [(w, 'guitarset-x') for w in sorted(glob.glob(f'{data}/guitarset2/*_mic.wav'))]
    for wav, gset in gs:
        tid = 'gs_' + os.path.basename(wav).replace('_mic.wav', '')
        jam = json.load(open(f"{data}/guitarset/ann/{os.path.basename(wav).replace('_mic.wav', '.jams')}"))
        dur = jam['file_metadata']['duration']
        notes, contours, kinds = [], [], ['notes', 'beats', 'key', 'tempo']
        for a in jam['annotations']:
            ns, d = a['namespace'], a['data']
            if ns == 'note_midi':
                notes += [(n['time'], n['time'] + n['duration'], float(hz(n['value']))) for n in d]
            elif ns == 'pitch_contour':
                contours.append((d['time'], [v['frequency'] if v['voiced'] else 0 for v in d['value']]))
            elif ns == 'beat_position':
                write_rows(f'{refs}/{tid}.beats.csv', [[b['time']] for b in d])
            elif ns == 'key_mode':
                k = d[0]['value'].replace(':', ' ')
                open(f'{refs}/{tid}.key.txt', 'w').write(k + '\n')
            elif ns == 'tempo':
                open(f'{refs}/{tid}.tempo.txt', 'w').write(f"{d[0]['value']}\n")
        notes.sort()
        write_rows(f'{refs}/{tid}.notes.csv', notes)
        t, frames = mf0_from_contours(contours, dur)
        write_poly(refs, tid, t, frames, kinds)
        manifest.append(dict(id=tid, set=gset, audio=wav, kinds=kinds))

    for wav in sorted(glob.glob(f'{data}/maestro/*.wav')):
        tid = 'maestro_' + os.path.basename(wav)[-20:-4].replace('-', '')
        notes = midi_notes(wav[:-4] + '.midi', crop=MAESTRO_CROP)
        write_rows(f'{refs}/{tid}.notes.csv', notes)
        kinds = ['notes']
        write_poly(refs, tid, *mf0_from_notes(notes, MAESTRO_CROP), kinds)
        manifest.append(dict(id=tid, set='maestro', audio=wav, crop=MAESTRO_CROP, kinds=kinds))

    for d in sorted(glob.glob(f'{data}/trios/TRIOS Dataset/*/')):
        name = os.path.basename(d.rstrip('/'))
        tid = 'trios_' + name
        notes = []
        for mid in glob.glob(f'{d}*.mid'):
            if os.path.basename(mid)[:-4] in ('kick', 'ride', 'snare'):
                continue
            notes += midi_notes(mid, pedal=False)
        notes.sort()
        write_rows(f'{refs}/{tid}.notes.csv', notes)
        dur = float(os.popen(f'ffprobe -v error -show_entries format=duration -of csv=p=0 "{d}mix.wav"').read())
        kinds = ['notes']
        write_poly(refs, tid, *mf0_from_notes(notes, dur), kinds)
        manifest.append(dict(id=tid, set='trios', audio=f'{d}mix.wav', kinds=kinds))

    json.dump(manifest, open(f'{out}/manifest.json', 'w'), indent=1)
    print(len(manifest), 'tracks')


def load_series(path, threshold=None):
    rows = read_rows(path)
    t = np.array([r[0] for r in rows])
    f = np.array([r[1] for r in rows])
    if threshold is not None and rows and len(rows[0]) > 2:
        c = np.array([r[2] for r in rows])
        f = np.where(c >= threshold, f, -f)  # negative = pitch guess on an unvoiced frame
    return t, np.nan_to_num(f)


def melody_scores(ref_path, est_path, threshold):
    import mir_eval.melody as mm
    rt, rf = load_series(ref_path)
    et, ef = load_series(est_path, threshold)
    rv, rc, ev, ec = mm.to_cent_voicing(rt, rf, et, ef)
    both = (rc > 0) & (ec > 0) & (rv > 0)
    err = np.abs(rc - ec)[both]
    fine = err[err < 50]
    return dict(
        RPA50=mm.raw_pitch_accuracy(rv, rc, ev, ec),
        RPA20=mm.raw_pitch_accuracy(rv, rc, ev, ec, cent_tolerance=20),
        RCA=mm.raw_chroma_accuracy(rv, rc, ev, ec),
        VR=mm.voicing_recall(rv, ev),
        VFA=mm.voicing_false_alarm(rv, ev),
        OA=mm.overall_accuracy(rv, rc, ev, ec),
        medCents=float(np.median(fine)) if len(fine) else float('nan'),
    )


def note_scores(ref_path, est_path):
    import mir_eval.transcription as mt
    def load(p):
        rows = read_rows(p)
        return (np.array([[r[0], r[1]] for r in rows]).reshape(-1, 2), np.array([r[2] for r in rows]))
    ri, rp = load(ref_path)
    ei, ep = load(est_path)
    ok = ei[:, 1] > ei[:, 0] if len(ei) else np.zeros(0, bool)
    ei, ep = ei[ok], ep[ok]
    if len(ei) == 0:
        return dict(F1on=0.0, Pon=0.0, Ron=0.0, F1off=0.0)
    p, r, f, _ = mt.precision_recall_f1_overlap(ri, rp, ei, ep, offset_ratio=None)
    _, _, f2, _ = mt.precision_recall_f1_overlap(ri, rp, ei, ep)
    return dict(F1on=f, Pon=p, Ron=r, F1off=f2)


def mf0_scores(ref_path, est_path):
    import mir_eval.multipitch as mp
    def load(p):
        rows = read_rows(p)
        return np.array([r[0] for r in rows]), [np.array([f for f in r[1:] if f > 0]) for r in rows]
    rt, rf = load(ref_path)
    et, ef = load(est_path)
    s = mp.evaluate(rt, rf, et, ef)
    return dict(Acc=s['Accuracy'], P=s['Precision'], R=s['Recall'], ChromaAcc=s['Chroma Accuracy'])


def beat_scores(ref_path, est_path):
    import mir_eval.beat as mb
    r = np.array([x[0] for x in read_rows(ref_path)])
    e = np.array([x[0] for x in read_rows(est_path)])
    s = mb.evaluate(r, e)
    return dict(F=s['F-measure'], CMLt=s['Correct Metric Level Total'], AMLt=s['Any Metric Level Total'])


def tempo_scores(ref_path, est_path):
    ref = float(open(ref_path).read())
    est = float(open(est_path).read())
    ratio = est / ref
    return dict(Acc1=float(abs(ratio - 1) < 0.04),
                Acc2=float(any(abs(ratio * k - 1) < 0.04 for k in (1, 2, 0.5, 3, 1 / 3))))


def key_scores(ref_path, est_path):
    import mir_eval.key as mk
    return dict(KeyScore=mk.weighted_score(open(ref_path).read().strip(), open(est_path).read().strip()))


SCORERS = dict(f0=None, melody=None, bass=None, notes=note_scores, mf0=mf0_scores, beats=beat_scores,
               key=key_scores, tempo=tempo_scores)
THRESHOLDS = [round(x, 2) for x in np.arange(0.0, 1.0, 0.05)]


def score(out, methods):
    manifest = {t['id']: t for t in json.load(open(f'{out}/manifest.json'))}
    methods = methods or sorted(os.path.basename(p) for p in glob.glob(f'{out}/est/*'))
    results = {}
    for m in methods:
        res = results.setdefault(m, {})
        files = glob.glob(f'{out}/est/{m}/*.*.csv') + glob.glob(f'{out}/est/{m}/*.*.txt')
        for path in sorted(files):
            tid, kind = os.path.basename(path).split('.')[:2]
            ext = path.rsplit('.', 1)[1]
            ref = f'{out}/refs/{tid}.{kind}.{ext}'
            if tid not in manifest or not os.path.exists(ref):
                continue
            key = f"{manifest[tid]['set']}/{kind}"
            if kind in ('f0', 'melody', 'bass'):
                per = {th: melody_scores(ref, path, th) for th in THRESHOLDS}
                res.setdefault(key, {})[tid] = per
            else:
                res.setdefault(key, {})[tid] = SCORERS[kind](ref, path)
        timing = f'{out}/est/{m}/timing.json'
        if os.path.exists(timing):
            res['_timing'] = json.load(open(timing))
    path = f'{out}/scores.json'
    merged = json.load(open(path)) if os.path.exists(path) else {}
    merged.update(results)
    json.dump(merged, open(path, 'w'))
    report(results)


def report(results):
    for m, res in results.items():
        t = res.get('_timing')
        speed = f"  [{t['msPerAudioSec']:.1f} ms/audio-s]" if t else ''
        print(f'\n## {m}{speed}')
        for key, per in sorted(res.items()):
            if key.startswith('_'):
                continue
            tracks = list(per.values())
            if isinstance(tracks[0], dict) and 0.0 in tracks[0]:
                # f0-style: pick the voicing threshold that maximises mean OA for this set
                best = max(THRESHOLDS, key=lambda th: np.mean([tr[th]['OA'] for tr in tracks]))
                agg = {k: np.nanmean([tr[best][k] for tr in tracks]) for k in tracks[0][best]}
                agg['thr'] = best
                agg['OA@0.5'] = np.mean([tr[0.5]['OA'] for tr in tracks])
            else:
                agg = {k: np.mean([tr[k] for tr in tracks]) for k in tracks[0]}
            print(f'  {key:24s} n={len(tracks):2d} ' + ' '.join(f'{k}={v:.3f}' for k, v in agg.items()))


def librosa_oracle(out):
    import librosa
    manifest = json.load(open(f'{out}/manifest.json'))
    for name in ('librosa-yin', 'librosa-pyin'):
        os.makedirs(f'{out}/est/{name}', exist_ok=True)
    total = {'librosa-yin': 0.0, 'librosa-pyin': 0.0}
    secs = 0.0
    for t in manifest:
        if 'f0' not in t['kinds']:
            continue
        y, sr = librosa.load(t['audio'], sr=22050, mono=True)
        secs += len(y) / sr
        kw = dict(fmin=50, fmax=2000, sr=sr, frame_length=2048, hop_length=256)
        t0 = time.time()
        f = librosa.yin(y, **kw)
        total['librosa-yin'] += time.time() - t0
        times = np.arange(len(f)) * 256 / sr
        write_rows(f"{out}/est/librosa-yin/{t['id']}.f0.csv", [[float(a), float(b), 1.0] for a, b in zip(times, f)])
        t0 = time.time()
        f, vflag, vprob = librosa.pyin(y, fill_na=None, **kw)
        total['librosa-pyin'] += time.time() - t0
        write_rows(f"{out}/est/librosa-pyin/{t['id']}.f0.csv",
                   [[float(a), float(np.nan_to_num(b)), float(p if v else 0)] for a, b, v, p in zip(times, f, vflag, vprob)])
    for name, s in total.items():
        json.dump(dict(msPerAudioSec=1000 * s / secs, note='python/librosa, not shippable'),
                  open(f'{out}/est/{name}/timing.json', 'w'))
    os.makedirs(f'{out}/est/librosa-beats', exist_ok=True)
    for t in manifest:
        if 'tempo' not in t['kinds']:
            continue
        y, sr = librosa.load(t['audio'], sr=22050, mono=True)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
        write_rows(f"{out}/est/librosa-beats/{t['id']}.beats.csv", [[float(b)] for b in beats])
        open(f"{out}/est/librosa-beats/{t['id']}.tempo.txt", 'w').write(f'{float(np.atleast_1d(tempo)[0]):.2f}\n')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'fetch':
        fetch(sys.argv[2], sys.argv[3])
    elif cmd == 'prep':
        prep(sys.argv[2], sys.argv[3])
    elif cmd == 'score':
        score(sys.argv[2], sys.argv[3:])
    elif cmd == 'librosa':
        librosa_oracle(sys.argv[2])
