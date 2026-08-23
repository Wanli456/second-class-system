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


def _extract_table_class_students(text: str):
    """解析原假条中“班级 / 姓名 / 联系方式 / 辅导员电话”这类表格。

    班级形如“应化2532”“应急2531”（中文 + 4位数字，且不一定带“班”字），
    姓名是连续的 2-4 字中文，电话号码是 1 开头的 11 位数字。
    """
    lines = [line.strip() for line in text.splitlines()]
    class_pattern = re.compile(r"^[\u4e00-\u9fff]{1,8}\d{4}$")
    name_pattern = re.compile(r"^[\u4e00-\u9fff]{2,4}$")
    phone_pattern = re.compile(r"^1\d{10}$")
    stop_names = {
        "请假条", "此致", "敬礼", "老师", "同学", "学生", "学生会", "学习", "竞技",
        "部长", "辅导员", "姓名", "班级", "联系方式", "备注", "日期", "批准", "您好",
        "情况", "属实", "名单", "电话", "签名", "签字", "公章", "老师签字", "情况属实",
        "生会", "校学生", "情属层", "校学生会", "学习意",
    }
    result = []
    current_class_name = None
    current_names = []
    seen_classes = set()

    def flush():
        nonlocal current_class_name, current_names
        if current_class_name and current_class_name not in seen_classes:
            seen_classes.add(current_class_name)
            clean_names = [name for name in current_names if name not in stop_names]
            if clean_names:
                result.append({"class_name": current_class_name, "students": clean_names, "student_ids": []})
        current_class_name = None
        current_names = []

    for line in lines:
        if class_pattern.match(line):
            flush()
            current_class_name = line
            current_names = []
            continue
        if phone_pattern.match(line):
            continue
        if current_class_name and name_pattern.match(line) and line not in stop_names:
            if line not in current_names:
                current_names.append(line)

    flush()
    return result


def extract_class_students(text: str, activity_name: str):
    """把整段文字按“班级”切块，提取 班级 -> 学生名单 的映射。"""
    flat = re.sub(r"\s+", " ", text).strip()
    if not flat:
        return []

    class_pattern = re.compile(r"([\u4e00-\u9fffA-Za-z0-9]{2,12}?\d{2,4}班)")
    matches = list(class_pattern.finditer(flat))
    if not matches:
        return _extract_table_class_students(text)

    seen_classes = set()
    result = []
    stop_words = {
        "兹有", "请假", "因", "因为", "参加", "参与", "盖章", "签字", "公章",
        "老师签字", "辅导员", "学生", "同学", "名单", "等", "特此", "证明",
        "尊敬的", "领导", "老师", "数字", "经济", "学院", activity_name,
    }

    bad_tokens = ('等', '请假', '参加', '参与', '人请', '校园', '智能', '创新', '新周', '班', '兹', '有', '数字', '经济', '学院', '老师', '签字')

    def clean_names(segment: str):
        if not segment:
            return []
        if activity_name:
            segment = segment.replace(activity_name, " ")
        segment = re.sub(r"[\d、，,。；;：:（）()【】[\]/\\|等]+", " ", segment)
        words = re.findall(r"[\u4e00-\u9fff]{2,4}", segment)
        result_names = []
        for word in words:
            if word in stop_words:
                continue
            if any(token in word for token in bad_tokens):
                continue
            result_names.append(word)
        return result_names

    def clean_ids(segment: str):
        if not segment:
            return []
        # 去掉常见的日期/时间串，再取 8-11 位学号。
        segment = re.sub(r"(\d{4})年(\d{1,2})月(\d{1,2})日", " ", segment)
        segment = re.sub(r"\d{1,2}:\d{2}", " ", segment)
        segment = re.sub(r"[,，。；;：:（）()【】[\]/\\|、]+", " ", segment)
        candidates = re.findall(r"(?<!\d)(\d{8,11})(?!\d)", segment)
        result_ids = []
        for candidate in candidates:
            # 8 位且像 2016-2035 年的日期，跳过。
            if len(candidate) == 8 and candidate.startswith('20'):
                try:
                    month = int(candidate[4:6])
                    day = int(candidate[6:8])
                    if 1 <= month <= 12 and 1 <= day <= 31:
                        continue
                except ValueError:
                    pass
            if candidate not in result_ids:
                result_ids.append(candidate)
        return result_ids

    previous_end = 0
    for index, match in enumerate(matches):
        raw_class = match.group(1)
        class_name = re.sub(r"^(兹有|学生|同学|姓名|名单|：|:|、|，|,|\s)+", "", raw_class)
        if not class_name:
            previous_end = match.end()
            continue
        if class_name in seen_classes:
            previous_end = match.end()
            continue
        seen_classes.add(class_name)

        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(flat)
        # 只有第一个班级前面的文字可能属于这个班（例如“张三 计算机2101班”）
        before_segment = flat[:match.start()] if index == 0 else ''
        after_segment = flat[match.end():next_start]
        previous_end = match.end()

        names = []
        for name in clean_names(before_segment) + clean_names(after_segment):
            if name not in names:
                names.append(name)
        ids = []
        for sid in clean_ids(before_segment) + clean_ids(after_segment):
            if sid not in ids:
                ids.append(sid)

        # 只有学号和姓名数量一致时才按顺序一一对应；不一致就宁可只留姓名，避免张冠李戴。
        student_ids = ids if len(ids) == len(names) else []

        result.append({"class_name": class_name, "students": names, "student_ids": student_ids})
    if result:
        return result
    return _extract_table_class_students(text)


def _extract_table_class_students_with_boxes(raw_lines):
    """基于文字坐标解析“班级 / 学号 / 姓名 / 联系方式 / 辅导员姓名...”表格。

    学生姓名和学号都取 x < 500 的列，辅导员姓名/辅导员电话在右侧
    x >= 500，不纳入学生名单。一行里学号数量与姓名数量一致时，按
    从左到右顺序一一对应；不一致时只保留姓名，避免张冠李戴。
    """
    class_pattern = re.compile(r"(^[\u4e00-\u9fffA-Za-z0-9]{1,12}班$|^[\u4e00-\u9fff]{1,8}\d{4}$)")
    name_pattern = re.compile(r"^[\u4e00-\u9fff]{2,4}$")
    phone_pattern = re.compile(r"^1\d{10}$")
    id_pattern = re.compile(r"^\d{8,12}$")
    stop_names = {
        "请假条", "此致", "敬礼", "老师", "同学", "学生", "学生会", "学习", "竞技",
        "部长", "辅导员", "姓名", "班级", "联系方式", "备注", "日期", "批准", "您好",
        "情况", "属实", "名单", "电话", "签名", "签字", "公章", "老师签字", "情况属实",
        "生会", "校学生", "情属层", "校学生会", "学习意",
    }

    entries = []
    for item in raw_lines:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        box = item.get("box")
        if not box or not box[0]:
            continue
        x = int(box[0][0])
        y = int(box[0][1])
        entries.append((x, y, text))
    entries.sort(key=lambda entry: (entry[1], entry[0]))

    rows = []
    for x, y, text in entries:
        if not rows or y - rows[-1]["max_y"] > 20:
            rows.append({"min_y": y, "max_y": y, "items": []})
        rows[-1]["max_y"] = max(rows[-1]["max_y"], y)
        rows[-1]["items"].append((x, y, text))

    class_entries = []
    for x, y, text in entries:
        if class_pattern.match(text) and x < 500:
            class_entries.append({"name": text, "y": y, "x": x})
    class_entries.sort(key=lambda item: (item["y"], item["x"]))

    class_order = []
    for item in class_entries:
        if item["name"] not in class_order:
            class_order.append(item["name"])

    students_by_class = {name: {"students": [], "student_ids": []} for name in class_order}

    for row in rows:
        row_y = row["max_y"]
        candidates = [item for item in class_entries if item["y"] <= row_y + 20]
        if not candidates:
            continue
        nearest_class = max(candidates, key=lambda item: item["y"])
        class_name = nearest_class["name"]
        if class_name not in students_by_class:
            continue

        row_items = sorted(row["items"], key=lambda entry: entry[0])
        names_in_row = []
        ids_in_row = []
        for x, y, text in row_items:
            if x >= 500:
                continue
            if name_pattern.match(text) and text not in stop_names:
                if text not in names_in_row:
                    names_in_row.append(text)
            elif id_pattern.match(text) and not phone_pattern.match(text):
                if text not in ids_in_row:
                    ids_in_row.append(text)

        if not names_in_row:
            continue
        paired_ids = ids_in_row if len(ids_in_row) == len(names_in_row) else []
        for index, name in enumerate(names_in_row):
            if name not in students_by_class[class_name]["students"]:
                students_by_class[class_name]["students"].append(name)
                students_by_class[class_name]["student_ids"].append(paired_ids[index] if paired_ids else "")

    result = []
    for class_name in class_order:
        entry = students_by_class[class_name]
        if entry["students"]:
            student_ids = [sid for sid in entry["student_ids"] if sid]
            result.append({
                "class_name": class_name,
                "students": entry["students"],
                "student_ids": student_ids if len(student_ids) == len(entry["students"]) else [],
            })
    return result


def parse_fields(text: str, raw_lines=None):
    fields = {
        "activity_name": "",
        "classes": [],
        "students": [],
        "student_ids": [],
        "class_students": [],
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

    # 班级与学生：按 “班级 -> 学生” 切块，既解决多班筛选，也避免班级名被截断。
    if raw_lines is not None:
        class_students = _extract_table_class_students_with_boxes(raw_lines)
        if not class_students:
            class_students = extract_class_students(text, fields["activity_name"])
    else:
        class_students = extract_class_students(text, fields["activity_name"])
    if class_students:
        fields["class_students"] = class_students
        fields["classes"] = [item["class_name"] for item in class_students]
        for item in class_students:
            for name in item["students"]:
                if name not in fields["students"]:
                    fields["students"].append(name)
            for sid in item.get("student_ids", []):
                if sid not in fields["student_ids"]:
                    fields["student_ids"].append(sid)

    # 覆盖行：保留便于前端展示的原文片段。
    cover_match = re.search(r"兹有(.{0,120}?)(?:等\s*\d+\s*人|请假)", text)
    if cover_match:
        fields["cover_line"] = cover_match.group(0)
        if not fields["class_students"]:
            after_class = re.sub(r"^.*?班", "", cover_match.group(1))
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
    raw_lines = []
    if ocr_result:
        for box, text, score in ocr_result:
            if text is None:
                continue
            text_value = str(text).strip()
            lines.append({"text": text_value, "score": float(score) if score is not None else None})
            raw_lines.append({
                "text": text_value,
                "score": float(score) if score is not None else None,
                "box": [[int(x), int(y)] for x, y in box],
            })

    full_text = "\n".join(line["text"] for line in lines)
    fields = {"activity_name": "", "classes": [], "students": [], "start_time": "", "end_time": "",
              "counselor_signature": False, "official_seal": False, "teacher_signature": False,
              "cover_line": "", "suggested_notes": ""}
    if lines:
        fields = parse_fields(full_text, raw_lines)

    result = {"ok": True, "lines": lines, "fields": fields, "engine": "RapidOCR"}
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())