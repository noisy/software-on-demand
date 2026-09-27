#!/usr/bin/env bash
# Rebuilds data/audio.json and data/lyrics.json from audio/builders.mp3.
# Needs: ffmpeg, Python 3.12+ with `pip install demucs librosa faster-whisper transformers torch scipy`.
# Steps: Demucs stems -> Whisper word pass (section windows) -> CTC forced alignment of the known lyrics
#        -> beat/downbeat/onset analysis -> export in the engine's format.
set -euo pipefail
cd "$(dirname "$0")"
W=work; mkdir -p $W/audio $W/analysis $W/data
ffmpeg -loglevel error -y -i ../audio/builders.mp3 -ar 48000 $W/audio/builders.wav
cp *.py $W/
cd $W
python -m demucs --two-stems=vocals -n htdemucs -o stems audio/builders.wav    # vocals / no_vocals
python -m demucs -n htdemucs -o stems4 audio/builders.wav                      # drums / bass / other / vocals
python transcribe.py        # -> analysis/whisper_words.json (used to pick the section windows in align.py)
python align.py             # -> analysis/lyrics.json (word timings)
python analyze.py           # -> data/timeline.json (beats, downbeats, kicks, sections)
python export_engine_data.py ../../data   # -> data/audio.json + data/lyrics.json for the renderer
