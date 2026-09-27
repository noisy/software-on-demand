"""Word-level lyric alignment for the Suno song "Builders".

Section windows come from the Whisper pass (transcribe.py); inside each window the known lyrics are forced onto
the Demucs vocal stem with CTC Viterbi alignment over wav2vec2 character emissions. Writes analysis/lyrics.json.
"""
import json
import re

import librosa
import numpy as np
import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

SR = 16000
# (section, window start, window end, lines). Windows: from the Whisper anchors, padded ~1 s.
SECTIONS = [
    ("intro", 3.2, 12.5, ["Any sufficiently advanced technology is indistinguishable from magic."]),
    ("verse1", 27.0, 42.2, ["It used to take a hundred hands,", "a tower and a name,",
                            "a year of meetings for a feature,", "while the long tail waited in the rain."]),
    ("pre1", 41.8, 50.2, ["Then the cost of making fell,", "and Jevons rang the bell."]),
    ("chorus1", 49.6, 65.6, ["Now everyone's a builder,", "one mind, a thousand hands.",
                             "Just say it, and it's standing:", "software on demand."]),
    ("verse2", 76.0, 90.3, ["Made of weights and attention,", "trained on tokens through the night.",
                            "Once we trusted the compiler,", "now we trust the words we write."]),
    ("pre2", 90.2, 97.6, ["Every niche and every dream,", "now it's worth the machine."]),
    ("chorus2", 97.6, 113.0, ["Now everyone's a builder,", "one mind, a thousand hands.",
                              "Just say it, and it's standing:", "software on demand."]),
    ("bridge", 129.2, 146.4, ["No studio, no label,", "no gate you have to pass.",
                              "The artist left the tower,", "the builder breaks the glass."]),
    ("chorus3", 146.4, 161.0, ["Now everyone's a builder,", "a wizard with a plan.",
                               "Just say it, and it's standing:", "software on demand."]),
    ("outro", 167.4, 172.4, ["Software on demand."]),
]

processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h").eval()
vocab = processor.tokenizer.get_vocab()
BLANK = vocab["<pad>"]
SEP = vocab["|"]
audio, _ = librosa.load("stems/htdemucs/builders/vocals.wav", sr=SR, mono=True)


def emissions(a, b):
    x = audio[int(a * SR):int(b * SR)]
    inp = processor(x, sampling_rate=SR, return_tensors="pt").input_values
    with torch.no_grad():
        logits = model(inp).logits[0]
    return torch.log_softmax(logits, -1).numpy(), (b - a) / logits.shape[0]


def ctc_align(logp, tokens):
    """Viterbi CTC alignment: frame index of every token (blank-interleaved trellis)."""
    ext = [BLANK]
    for t in tokens:
        ext += [t, BLANK]
    T, S = len(logp), len(ext)
    dp = np.full((T, S), -np.inf)
    bp = np.zeros((T, S), dtype=np.int8)
    dp[0, 0], dp[0, 1] = logp[0, ext[0]], logp[0, ext[1]]
    allowed = np.array([s >= 2 and ext[s] != BLANK and ext[s] != ext[s - 2] for s in range(S)])
    for t in range(1, T):
        stay = dp[t - 1]
        step = np.concatenate([[-np.inf], dp[t - 1, :-1]])
        skip = np.concatenate([[-np.inf, -np.inf], dp[t - 1, :-2]])
        skip = np.where(allowed, skip, -np.inf)
        cand = np.stack([stay, step, skip])
        bp[t] = cand.argmax(0)
        dp[t] = cand.max(0) + logp[t, ext]
    s = S - 1 if dp[-1, S - 1] > dp[-1, S - 2] else S - 2
    path = []
    for t in range(T - 1, -1, -1):
        path.append((t, s))
        s -= int(bp[t, s])
    path.reverse()
    first, last = {}, {}
    for t, s in path:
        if ext[s] != BLANK:
            k = (s - 1) // 2
            first.setdefault(k, t)
            last[k] = t
    return first, last


def clean(word):
    return re.sub(r"[^A-Z']", "", word.upper())


out = []
for name, a, b, lines in SECTIONS:
    logp, fdur = emissions(a, b)
    words = [(li, w) for li, line in enumerate(lines) for w in line.split()]
    tokens, owner = [], []
    for wi, (_, w) in enumerate(words):
        for ch in clean(w):
            tokens.append(vocab.get(ch, vocab.get("'")))
            owner.append(wi)
        if wi < len(words) - 1:
            tokens.append(SEP)
            owner.append(-1)
    first, last = ctc_align(logp, tokens)
    for wi, (li, w) in enumerate(words):
        ks = [k for k, o in enumerate(owner) if o == wi]
        s = a + first[ks[0]] * fdur
        e = a + (last[ks[-1]] + 1) * fdur
        out.append({"section": name, "line": li, "word": w, "s": round(s, 3), "e": round(e, 3)})
    print(name, " ".join(f"{x['word']}@{x['s']:.2f}" for x in out if x["section"] == name))

json.dump(out, open("analysis/lyrics.json", "w"), indent=1)
print(len(out), "words aligned")
