# -*- coding: utf-8 -*-
"""假条图片本地 OCR 测试脚本（免费、离线）。

用法:
    python ocr_test.py [图片路径]

默认读取本目录下的 sample.png。
识别结果输出到 stdout，并把每行文字和置信度打印出来。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_engine():
    """兼容 rapidocr_onnxruntime / rapidocr 两种包名。"""
    try:
        from rapidocr_onnxruntime import RapidOCR
        print("[OCR] 引擎: rapidocr_onnxruntime", file=sys.stderr)
        return RapidOCR()
    except ImportError:
        from rapidocr import RapidOCR
        print("[OCR] 引擎: rapidocr (onnxruntime)", file=sys.stderr)
        return RapidOCR()


def main() -> int:
    image_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "sample.png"
    if not image_path.exists():
        print(f"[OCR] 未找到图片: {image_path}", file=sys.stderr)
        print("      用法: python ocr_test.py <图片路径>", file=sys.stderr)
        return 2

    print(f"[OCR] 图片: {image_path}", file=sys.stderr)
    print(f"[OCR] 大小: {image_path.stat().st_size} bytes", file=sys.stderr)

    engine = load_engine()
    result, _ = engine(str(image_path))

    lines = []
    if result:
        for box, text, score in result:
            if text is None:
                continue
            lines.append({"text": str(text).strip(), "score": float(score) if score is not None else None})
            print(f"    置信度={float(score):.4f}  文字={text!s}", file=sys.stdout)

    print(f"[OCR] 共识别 {len(lines)} 行文字", file=sys.stderr)
    if lines:
        print("[OCR] 拼接文本:", file=sys.stderr)
        print("\n".join(line["text"] for line in lines), file=sys.stderr)

    print(json.dumps({"engine": "RapidOCR", "lines": lines}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())