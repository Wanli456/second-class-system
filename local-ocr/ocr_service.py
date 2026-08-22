# -*- coding: utf-8 -*-
"""假条图片 OCR 识别服务（供 /api/ocr/analyze 调用）。

用法:
    python ocr_service.py <图片路径> <输出JSON路径>

功能:
    1. 运行 RapidOCR 识别图片全部文字行；
    2. 用规则从文字行中提取原假条初步字段；
    3. 把 lines + fields 写入输出 JSON 文件（不依赖 stdout，兼容命名管道受限环境）。

规则提取仅作为“初稿”，必须由人工核对后保存。
"""
import json
import re
import sys
from pathlib import Path


def load_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
        return RapidOCR()
    except ImportError:
        from rapidocr import RapidOCR
        return RapidOCR()


def parse_fields(text: str):
    fields = {
        "activity_name": "",
        "classes": [],
        "students": [],
        "start_time": "",
        "end_time": "",
        "counselor_signature": False,
        "official_seal": False,
        "teacher_signature": False,
        "cover_line": "",
        "suggested_notes": "",
    }

    # 活动名称：因参加 xxx 请假 / 参加 xxx 请假 / 参与 xxx
    activity_match = re.search(r"(?:因|因为)?(?:参加|参与)\s*([^，。,；;请]{4,40}?)(?:请假|，|,|。|；|;)", text)
    if activity_match:
        fields["activity_name"] = activity_match.group(1).strip()

    # 班级：优先解析 “兹有计算机2101班”，再回退到常见的 “XX2101班”。
    for cls in re.findall(r"兹有\s*([\u4e00-\u9fffA-Za-z0-9]+?\d{2,4}班)", text):
        if cls not in fields["classes"]:
            fields["classes"].append(cls)
    if not fields["classes"]:
        for cls in re.findall(r"([\u4e00-\u9fffA-Za-z0-9]{2,12}?)(?:\d{2,4}班)", text):
            candidate = f"{cls[0]}{cls[1]}" if len(cls) > 1 else cls[0]
            if candidate and candidate not in fields["classes"]:
                fields["classes"].append(candidate)

    # 学生：解析 “兹有计算机2101班张三、李四、王五等N人” —— 班级后面的词才是姓名。
    cover_match = re.search(r"兹有(.{0,120}?)(?:等\s*\d+\s*人|请假)", text)
    if cover_match:
        segment = cover_match.group(0)
        fields["cover_line"] = segment
        after_class = re.sub(r"^.*?班", "", cover_match.group(1))
        # 取顿号/逗号分隔的姓名（2-4 个汉字）
        names = re.findall(r"([\u4e00-\u9fff]{2,4})", after_class)
        stop_words = {"等", "因", "参加", "参与", "请假", "兹有"}
        fields["students"] = [name for name in names if name not in stop_words][:80]

    # 时间：2026年08月22日 13:00 - 17:00（兼容全角/半角连字符）
    time_spans = re.findall(r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})\s*[—\-\u2013\u2014\uff0d~～至]\s*(\d{1,2})?:?(\d{2})?", text)
    if time_spans:
        span = time_spans[0]
        year, month, day = int(span[0]), int(span[1]), int(span[2])
        start_hour, start_min = int(span[3]), int(span[4])
        fields["start_time"] = f"{year:04d}-{month:02d}-{day:02d}T{start_hour:02d}:{start_min:02d}"
        if span[5]:
            end_hour, end_min = int(span[5]), int(span[6] or 0)
            fields["end_time"] = f"{year:04d}-{month:02d}-{day:02d}T{end_hour:02d}:{end_min:02d}"

    if "辅导员" in text and ("签字" in text or "签名" in text):
        fields["counselor_signature"] = True
    if "公章" in text or "盖章" in text:
        fields["official_seal"] = True
    if "老师签字" in text or "指导老师" in text:
        fields["teacher_signature"] = True

    if fields["classes"]:
        fields["suggested_notes"] = "OCR 初稿，请人工核对班级、姓名、时间后再保存。"
    return fields


def main() -> int:
    if len(sys.argv) < 3:
        print("用法: python ocr_service.py <图片路径> <输出JSON路径>", file=sys.stderr)
        return 2

    image_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    if not image_path.exists():
        result = {"ok": False, "error": f"图片不存在: {image_path}"}
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return 2

    engine = load_engine()
    ocr_result, _ = engine(str(image_path))

    lines = []
    if ocr_result:
        for box, text, score in ocr_result:
            if text is None:
                continue
            lines.append({"text": str(text).strip(), "score": float(score) if score is not None else None})

    full_text = "\n".join(line["text"] for line in lines)
    fields = {"activity_name": "", "classes": [], "students": [], "start_time": "", "end_time": "",
              "counselor_signature": False, "official_seal": False, "teacher_signature": False,
              "cover_line": "", "suggested_notes": ""}
    if lines:
        fields = parse_fields(full_text)

    result = {"ok": True, "lines": lines, "fields": fields, "engine": "RapidOCR"}
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())