"""Export the analysis in the engine's format: data/audio.json (beats, downbeats, sections, 100 fps envelopes,
kick/snare/hat/vocal onsets) and data/lyrics.json (lines of word timings from align.py)."""
import json
import os
import sys

import librosa
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "../builders-video/data"
os.makedirs(OUT, exist_ok=True)
SR, FPS = 22050, 100
HOP = SR // FPS  # 220 samples = 10 ms (22050/100 = 220.5; we resample time exactly below)
stem = lambda n: librosa.load(f"stems4/htdemucs/builders/{n}.wav", sr=SR, mono=True)[0]
mix = librosa.load("audio/builders.wav", sr=SR, mono=True)[0]
drums, bass, other, vocals = stem("drums"), stem("bass"), stem("other"), stem("vocals")
duration = len(mix) / SR
n = int(duration * FPS)
tl = json.load(open("data/timeline.json"))
beats, downbeats = tl["beats"], tl["downbeats"]


def frames_env(x, lo=None, hi=None):
    """0..1 envelope at exactly FPS frames/s."""
    hop = 256
    if lo is None and hi is None:
        e = librosa.feature.rms(y=x, frame_length=1024, hop_length=hop)[0]
    else:
        S = np.abs(librosa.stft(x, n_fft=2048, hop_length=hop))
        f = librosa.fft_frequencies(sr=SR, n_fft=2048)
        e = S[(f >= (lo or 0)) & (f < (hi or SR))].sum(0)
    t_src = librosa.frames_to_time(np.arange(len(e)), sr=SR, hop_length=hop)
    e = np.interp(np.arange(n) / FPS, t_src, e)
    e = e / (np.percentile(e, 99.5) + 1e-9)
    return np.clip(e, 0, 1).round(3).tolist()


def onsets(x, lo, hi, thresh, wait):
    hop = 256
    S = np.abs(librosa.stft(x, n_fft=2048, hop_length=hop))
    f = librosa.fft_frequencies(sr=SR, n_fft=2048)
    band = np.log1p(S[(f >= lo) & (f < hi)].sum(0) * 10)
    flux = np.maximum(0, np.diff(band, prepend=band[0]))
    flux /= flux.max() + 1e-9
    pk = librosa.util.peak_pick(flux, pre_max=4, post_max=4, pre_avg=12, post_avg=12, delta=thresh, wait=wait)
    t = librosa.frames_to_time(pk, sr=SR, hop_length=hop)
    return [[round(float(a), 3), round(float(b), 3)] for a, b in zip(t, flux[pk]) if b > thresh]


voc_on = librosa.onset.onset_detect(y=vocals, sr=SR, units="time", backtrack=False, delta=0.12)
vocal_strength = np.interp(voc_on, np.arange(n) / FPS, frames_env(vocals)) if len(voc_on) else []

D = lambda k: downbeats[min(k, len(downbeats) - 1)]
SECTIONS = [("intro", 0, 12.1), ("build", 12.1, D(13)), ("verse1", D(13), D(20)), ("pre1", D(20), D(25)),
            ("chorus1", D(25), D(32)), ("inst1", D(32), D(38)), ("verse2", D(38), 90.5), ("pre2", 90.5, D(50)),
            ("chorus2", D(50), D(57)), ("inst2", D(57), D(66)), ("bridge", D(66), 144.78), ("chorus3", 144.78, D(83)),
            ("outro", D(83), duration)]

audio = {
    "duration": round(duration, 3), "bpm": tl["bpm"], "beat_period": round(float(np.median(np.diff(beats))), 5),
    "time_signature": 4, "beats": beats, "downbeats": downbeats,
    "sections": [{"name": a, "start": round(s, 3), "end": round(e, 3)} for a, s, e in SECTIONS],
    "fps": FPS,
    "rms": frames_env(mix), "low": frames_env(mix, 0, 150), "mid": frames_env(mix, 300, 3000), "high": frames_env(mix, 5000),
    "vocal": frames_env(vocals), "drums": frames_env(drums), "bass": frames_env(bass), "other": frames_env(other),
    "onsets": {
        "kick": onsets(drums, 30, 150, 0.12, 8),
        "snare": onsets(drums, 180, 2500, 0.18, 8),
        "hat": onsets(drums, 6000, 11000, 0.2, 4),
        "vocal": [[round(float(a), 3), round(float(b), 3)] for a, b in zip(voc_on, vocal_strength)],
    },
    "notes": "Builders (Suno v6-mini). Beats: librosa on the mix; onsets: spectral flux bands of the Demucs drum stem.",
}
json.dump(audio, open(f"{OUT}/audio.json", "w"))

words = json.load(open("analysis/lyrics.json"))
lines, cur = [], None
for w in words:
    key = (w["section"], w["line"])
    if cur is None or cur["key"] != key:
        cur = {"key": key, "section": w["section"], "words": []}
        lines.append(cur)
    cur["words"].append({"w": w["word"], "start": w["s"], "end": max(w["e"], w["s"] + 0.08), "conf": 1.0})
out_lines = []
for i, l in enumerate(lines):
    ws = l["words"]
    out_lines.append({"i": i, "section": l["section"], "text": " ".join(x["w"] for x in ws),
                      "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
json.dump({"lines": out_lines, "extras": [], "notes": "CTC-aligned (wav2vec2) to the Demucs vocal stem; see align.py"},
          open(f"{OUT}/lyrics.json", "w"), indent=1)
print("sections:", [(a, round(s, 1)) for a, s, _ in SECTIONS])
print("onsets:", {k: len(v) for k, v in audio["onsets"].items()}, "lines:", len(out_lines))
