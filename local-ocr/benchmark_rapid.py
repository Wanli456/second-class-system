# -*- coding: utf-8 -*-
import sys
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
image = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'sample.png'

from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
# warmup
engine(str(image))

times = []
results = None
for _ in range(5):
    start = time.perf_counter()
    results, _ = engine(str(image))
    times.append(time.perf_counter() - start)

lines = []
if results:
    for _, text, score in results:
        if text is not None:
            lines.append({'text': str(text).strip(), 'score': float(score) if score is not None else None})

print(json.dumps({
    'engine': 'RapidOCR',
    'image': str(image),
    'runs': len(times),
    'times': [round(t, 4) for t in times],
    'avg_seconds': round(sum(times) / len(times), 4),
    'min_seconds': round(min(times), 4),
    'max_seconds': round(max(times), 4),
    'lines': lines,
}, ensure_ascii=False, indent=2))
