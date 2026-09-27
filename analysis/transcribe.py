"""Word-level transcription of the Demucs vocal stem (faster-whisper), saved to analysis/whisper_words.json."""
import json, os
from faster_whisper import WhisperModel
PROMPT = ("Any sufficiently advanced technology is indistinguishable from magic. It used to take a hundred hands, a tower and a name. "
          "Then the cost of making fell, and Jevons rang the bell. Now everyone's a builder, one mind, a thousand hands. "
          "Just say it, and it's standing: software on demand. Made of weights and attention, trained on tokens through the night.")
model = WhisperModel("small.en", device="cpu", compute_type="int8")
segs, _ = model.transcribe("stems/htdemucs/builders/vocals.wav", language="en", beam_size=5, word_timestamps=True,
                           initial_prompt=PROMPT, vad_filter=True, condition_on_previous_text=True)
words = []
for s in segs:
    print(f"[{s.start:6.2f}-{s.end:6.2f}] {s.text.strip()}")
    words += [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)} for w in s.words]
os.makedirs("analysis", exist_ok=True)
json.dump(words, open("analysis/whisper_words.json", "w"), indent=0)
print(len(words), "words")
