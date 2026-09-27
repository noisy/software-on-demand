"""Beat grid, downbeats, kick hits, sections and 60 fps loudness envelopes for "Builders". Writes data/timeline.json."""
import json

import librosa
import numpy as np

FPS = 60
SR = 22050
mix, _ = librosa.load("audio/builders.wav", sr=SR, mono=True)
inst, _ = librosa.load("stems/htdemucs/builders/no_vocals.wav", sr=SR, mono=True)
voc, _ = librosa.load("stems/htdemucs/builders/vocals.wav", sr=SR, mono=True)
duration = len(mix) / SR

# Beats on the full mix; downbeat phase = the beat position (mod 4) with the strongest low end.
_, beats = librosa.beat.beat_track(y=mix, sr=SR, units="time", tightness=200)
S = np.abs(librosa.stft(inst, n_fft=2048, hop_length=512))
freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
low = S[freqs < 150].sum(0)
t_frames = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=512)
low_at_beat = np.interp(beats, t_frames, low)
phase = int(np.argmax([low_at_beat[p::4].mean() for p in range(4)]))
downbeats = beats[phase::4]

# Kick hits: peaks of low-band onset strength near beats.
low_onset = np.maximum(0, np.diff(low, prepend=low[0]))
low_onset /= low_onset.max() + 1e-9
peaks = librosa.util.peak_pick(low_onset, pre_max=6, post_max=6, pre_avg=10, post_avg=10, delta=0.08, wait=8)
kicks = [round(float(t_frames[p]), 3) for p in peaks if low_onset[p] > 0.12]

# Envelopes at 60 fps.
hop = SR // FPS
n = int(duration * FPS)


def env(x, lo=None, hi=None):
    if lo is None and hi is None:
        e = librosa.feature.rms(y=x, frame_length=hop * 2, hop_length=hop)[0]
    else:
        spec = np.abs(librosa.stft(x, n_fft=1024, hop_length=hop))
        f = librosa.fft_frequencies(sr=SR, n_fft=1024)
        m = (f >= (lo or 0)) & (f < (hi or SR))
        e = spec[m].sum(0)
    e = e[:n]
    e = np.pad(e, (0, max(0, n - len(e))))
    return (e / (np.percentile(e, 99.5) + 1e-9)).clip(0, 1.2).round(3).tolist()


lyrics = json.load(open("analysis/lyrics.json"))
sections = {}
for w in lyrics:
    sec = sections.setdefault(w["section"], {"s": w["s"], "e": w["e"]})
    sec["s"], sec["e"] = min(sec["s"], w["s"]), max(sec["e"], w["e"])

out = {
    "fps": FPS, "duration": round(duration, 3), "bpm": round(60 / float(np.median(np.diff(beats))), 2),
    "beats": [round(float(b), 3) for b in beats], "downbeats": [round(float(b), 3) for b in downbeats],
    "kicks": kicks, "sections": sections, "lyrics": lyrics,
    "env": {"master": env(mix), "low": env(inst, 0, 150), "high": env(inst, 5000, None), "mid": env(inst, 300, 3000), "vocal": env(voc)},
}
json.dump(out, open("data/timeline.json", "w"))
print("bpm", out["bpm"], "beats", len(beats), "downbeat phase", phase, "first downbeats", downbeats[:4].round(2), "kicks", len(kicks))
for k, v in sections.items():
    print(f"  {k:8s} {v['s']:7.2f} - {v['e']:7.2f}")
