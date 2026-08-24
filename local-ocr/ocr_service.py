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


_NON_STUDENT_TEXT = (
    "请假", "信息", "天数", "是否", "出校", "去向", "地址", "事由", "手机",
    "定位", "销假", "续假", "学期", "学年", "状态", "详情", "日期", "时间",
    "课程", "审批", "班级", "姓名", "学号", "电话", "签字", "辅导员", "老师",
    "学院", "专业", "电子商务",
)


def _looks_like_mobile_leave_form(text: str) -> bool:
    """Mobile leave-detail screenshots contain labels, not a roster table."""
    labels = ("请假信息", "请假天数", "是否出校", "请假事由", "手机号", "定位销假", "续假申请")
    return sum(label in text for label in labels) >= 2


def _is_plausible_student_name(value: str) -> bool:
    """Keep only a likely personal name; form labels must never become students."""
    candidate = re.sub(r"\s+", "", str(value or ""))
    if not candidate or any(word in candidate for word in _NON_STUDENT_TEXT):
        return False
    if "·" in candidate:
        return bool(re.fullmatch(r"[\u4e00-\u9fff]{1,6}·[\u4e00-\u9fff]{2,8}", candidate))
    # A regular Chinese student name is 2--4 characters.  Longer OCR tokens
    # are usually two merged table cells and must be left for manual correction.
    return bool(re.fullmatch(r"[\u4e00-\u9fff]{2,4}", candidate))


def _sanitize_class_students(groups):
    """Drop OCR labels/merged tokens while retaining aligned student IDs."""
    sanitized = []
    for group in groups or []:
        class_name = str(group.get("class_name") or "").strip()
        students = group.get("students") or []
        student_ids = group.get("student_ids") or []
        valid_students, valid_ids = [], []
        for index, student in enumerate(students):
            name = re.sub(r"\s+", "", str(student or ""))
            if not _is_plausible_student_name(name):
                continue
            if name in valid_students:
                continue
            valid_students.append(name)
            valid_ids.append(str(student_ids[index] if index < len(student_ids) else "").strip())
        if class_name and valid_students:
            sanitized.append({"class_name": class_name, "students": valid_students, "student_ids": valid_ids})
    return sanitized


def load_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
        return RapidOCR()
    except ImportError:
        from rapidocr import RapidOCR
        return RapidOCR()


def _order_corners(points):
    """将四个透视角点排序为左上、右上、右下、左下。"""
    import numpy as np

    points = points.astype("float32")
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).reshape(-1)
    return np.array([
        points[np.argmin(sums)],
        points[np.argmin(differences)],
        points[np.argmax(sums)],
        points[np.argmax(differences)],
    ], dtype="float32")


def _table_cells(image):
    """从拉正后的照片检测表格网格单元格，供坐标识别按列定位。"""
    import cv2

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 12,
    )
    vertical = cv2.morphologyEx(
        binary, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(18, height // 32))),
    )
    horizontal = cv2.morphologyEx(
        binary, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(18, width // 32), 1)),
    )
    grid = cv2.bitwise_or(vertical, horizontal)
    contours, _ = cv2.findContours(grid, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    cells = []
    for contour in contours:
        x, y, cell_width, cell_height = cv2.boundingRect(contour)
        if cell_width < 36 or cell_height < 18 or cell_width > width * 0.96 or cell_height > height * 0.96:
            continue
        cells.append((x, y, x + cell_width, y + cell_height))
    return sorted(set(cells), key=lambda cell: (cell[1], cell[0]))


def _read_image(path: Path):
    """Read image paths safely on Windows, including Chinese file names."""
    import cv2
    import numpy as np

    try:
        data = np.fromfile(str(path), dtype=np.uint8)
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except OSError:
        return None


def prepare_for_ocr(image_path: Path, output_dir: Path):
    """OpenCV 透视矫正照片；没有可靠四角时安全回退为原始比例。"""
    try:
        import cv2
        import numpy as np

        image = _read_image(image_path)
        if image is None:
            return image_path, {"applied": False, "reason": "图片无法由 OpenCV 读取", "table_cells": []}
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 60, 180)
        edges = cv2.dilate(edges, np.ones((5, 5), dtype=np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        corners = None
        for contour in sorted(contours, key=cv2.contourArea, reverse=True):
            if cv2.contourArea(contour) < width * height * 0.12:
                break
            approximation = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
            if len(approximation) == 4:
                corners = approximation.reshape(4, 2)
                break

        corrected = image
        applied = False
        if corners is not None:
            source = _order_corners(corners)
            top = np.linalg.norm(source[1] - source[0])
            bottom = np.linalg.norm(source[2] - source[3])
            left = np.linalg.norm(source[3] - source[0])
            right = np.linalg.norm(source[2] - source[1])
            target_width = max(1, int(max(top, bottom)))
            target_height = max(1, int(max(left, right)))
            destination = np.array([
                [0, 0], [target_width - 1, 0], [target_width - 1, target_height - 1], [0, target_height - 1],
            ], dtype="float32")
            corrected = cv2.warpPerspective(image, cv2.getPerspectiveTransform(source, destination), (target_width, target_height))
            applied = True

        corrected_path = output_dir / "opencv-corrected.png"
        if not cv2.imwrite(str(corrected_path), corrected):
            return image_path, {"applied": False, "reason": "矫正图片写入失败", "table_cells": []}
        cells = _table_cells(corrected)
        return corrected_path, {
            "applied": applied,
            "reason": "已完成透视矫正" if applied else "未检测到可安全矫正的四角，保留原始比例",
            "table_cells": [list(cell) for cell in cells],
        }
    except Exception as error:
        return image_path, {"applied": False, "reason": f"OpenCV 预处理未完成：{error}", "table_cells": []}


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
    # 本校学号为以 2 开头的 10 位数字。照片中被表线截断的联系电话可能是
    # 8 到 10 位数字，若一并计作学号会使整列错位。
    id_pattern = re.compile(r"^2\d{9}$")
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
        # OpenCV 已定位网格时，采用单元格左上角作为该文字的列/行归属；
        # 没有清晰表格线则回退 RapidOCR 原始文字框。
        # OCR 文字框才是可靠的列定位依据。OpenCV 检出的候选单元格仅作
        # 诊断元数据：不完整或倾斜的表格会产生过大的候选格，若用其左上角
        # 覆盖文字坐标，右侧辅导员列会被错误归入学生姓名列。
        x = int(box[0][0])
        y = int(box[0][1])
        entries.append((x, y, text))
    entries.sort(key=lambda entry: (entry[1], entry[0]))

    # 倾斜拍摄时，同一张表格的右侧单元格会比左侧低几十像素；不能再按绝对 y
    # 把所有单元格硬分行。改为由表头确定三列，再分别按表格自上而下顺序配对。
    def header_x(keyword):
        return next((x for x, _, text in entries if keyword in text), None)

    class_header_x = header_x("班级")
    name_header_x = header_x("姓名")
    student_id_header_x = header_x("学号")
    contact_header_x = header_x("联系方式")
    advisor_header_x = header_x("辅导员")

    if name_header_x is None:
        # This photographed template has no visible header row.  A text-only
        # fallback cannot tell the student-name column from the counsellor-name
        # column, so it used to put the counsellor into the leave list.  Infer
        # the left three columns from the class and 10-digit student-ID columns
        # instead; if the three columns cannot be paired safely, return no
        # automatic student instead of returning a wrong person.
        class_entries = [
            {"name": re.sub(r"\s+", "", text), "row_y": y, "x": x}
            for x, y, text in entries
            if class_pattern.match(re.sub(r"\s+", "", text))
        ]
        id_entries = [
            {"student_id": text, "row_y": y, "x": x}
            for x, y, text in entries
            if id_pattern.match(text) and not phone_pattern.match(text)
        ]
        if not class_entries or len(class_entries) != len(id_entries):
            return []
        class_x = sorted(item["x"] for item in class_entries)[len(class_entries) // 2]
        id_x = sorted(item["x"] for item in id_entries)[len(id_entries) // 2]
        if id_x <= class_x:
            return []
        name_left = (class_x + id_x) / 2
        name_right = id_x
        name_entries = [
            {"name": text, "row_y": y}
            for x, y, text in entries
            if name_left <= x < name_right and name_pattern.match(text) and text not in stop_names
        ]
        class_entries.sort(key=lambda item: item["row_y"])
        name_entries.sort(key=lambda item: item["row_y"])
        id_entries.sort(key=lambda item: item["row_y"])
        if len(class_entries) != len(name_entries) or len(name_entries) != len(id_entries):
            return []
        grouped = {}
        for index, class_entry in enumerate(class_entries):
            group = grouped.setdefault(class_entry["name"], {"students": [], "student_ids": []})
            group["students"].append(name_entries[index]["name"])
            group["student_ids"].append(id_entries[index]["student_id"])
        return [
            {"class_name": class_name, "students": value["students"], "student_ids": value["student_ids"]}
            for class_name, value in grouped.items()
        ]

    # 有些旧假条只有“班级 / 姓名 / 联系方式 / 辅导员姓名 / 辅导员电话”，
    # 没有学号列。此时绝不能降级到纯文本解析：该解析无法区分姓名列和
    # 辅导员姓名列，会把导员错误加入请假学生。按表头横坐标只读取姓名列，
    # 让前端保留空学号以便与花名册匹配或人工补充。
    if student_id_header_x is None:
        advisor_header_x = header_x("辅导员")
        contact_header_x = header_x("联系方式")
        if class_header_x is None or contact_header_x is None:
            return _extract_table_class_students("\n".join(text for _, _, text in entries))
        class_right = (class_header_x + name_header_x) / 2
        name_left = class_right
        # 姓名列必须止于“姓名/联系方式”中线；以辅导员列作右边界会把
        # 导员姓名纳入学生名单。
        name_right = (name_header_x + contact_header_x) / 2
        class_entries = [
            {"name": re.sub(r"\s+", "", text), "row_y": y}
            for x, y, text in entries
            if x < class_right and class_pattern.match(re.sub(r"\s+", "", text))
        ]
        name_entries = [
            {"name": text, "row_y": y}
            for x, y, text in entries
            if name_left <= x < name_right and name_pattern.match(text) and text not in stop_names
        ]
        class_entries.sort(key=lambda item: item["row_y"])
        name_entries.sort(key=lambda item: item["row_y"])
        if not class_entries or len(class_entries) != len(name_entries):
            return []
        grouped = {}
        for index, class_entry in enumerate(class_entries):
            entry = grouped.setdefault(class_entry["name"], {"students": [], "student_ids": []})
            entry["students"].append(name_entries[index]["name"])
            entry["student_ids"].append("")
        return [
            {"class_name": class_name, "students": value["students"], "student_ids": value["student_ids"]}
            for class_name, value in grouped.items()
        ]

    class_right = (class_header_x + name_header_x) / 2 if class_header_x is not None else name_header_x
    name_left = (class_header_x + name_header_x) / 2 if class_header_x is not None else name_header_x - 120
    name_right = (name_header_x + student_id_header_x) / 2
    # 透视会使下方学号逐行向左偏移，甚至落到“姓名/学号”两表头的中线左边；
    # 使用两个表头中较左的横坐标作为边界，结合 10 位 2 开头学号规则排除姓名列。
    id_left = min(name_header_x, student_id_header_x)
    # 学号是纯数字，联系方式是 11 位手机号，会被 phone_pattern 排除。因此学号列的
    # 右边界可以延伸到辅导员列，不能用“学号/联系方式”的中线：斜拍时学号框会
    # 向右偏移到该中线之后，进而整列被误判为联系方式。
    id_right = advisor_header_x or contact_header_x or student_id_header_x + 300

    # 用表头的倾斜斜率校正行坐标。拍照透视会让右侧同一行比左侧低几十像素。
    header_points = [
        (x, y) for x, y, text in entries
        if text in {"班级", "姓名", "学号", "联系方式"} or "辅导员" in text
    ]
    if len(header_points) >= 2:
        first_header = min(header_points, key=lambda item: item[0])
        last_header = max(header_points, key=lambda item: item[0])
        horizontal_span = last_header[0] - first_header[0]
        slope = (last_header[1] - first_header[1]) / horizontal_span if horizontal_span else 0
    else:
        slope = 0

    def normalized_class_name(text):
        return re.sub(r"\s+", "", text)

    def corrected_y(x, y):
        return y - slope * x

    class_entries = [
        {"name": normalized_class_name(text), "row_y": corrected_y(x, y)}
        for x, y, text in entries
        if x < class_right and class_pattern.match(normalized_class_name(text))
    ]
    name_entries = [
        {"name": text, "row_y": corrected_y(x, y)}
        for x, y, text in entries
        if name_left <= x < name_right and name_pattern.match(text) and text not in stop_names
    ]
    id_entries = [
        {"student_id": text, "row_y": corrected_y(x, y)}
        for x, y, text in entries
        if id_left <= x < id_right and id_pattern.match(text) and not phone_pattern.match(text)
    ]
    class_entries.sort(key=lambda item: item["row_y"])
    name_entries.sort(key=lambda item: item["row_y"])
    id_entries.sort(key=lambda item: item["row_y"])

    # 三列数量相同才能安全地逐行一一配对；否则保留已可靠识别的姓名/班级，
    # 让页面留空学号供人工补齐，而不是把相邻学生错配。
    if not class_entries or len(class_entries) != len(name_entries):
        return _extract_table_class_students("\n".join(text for _, _, text in entries))
    # 固定名单表的每列均按同一行序从上到下排列。三列数量一致时按索引配对，
    # 不再使用跨列 y 坐标的“最近”规则；透视拍摄会让右侧学号整体下移而错配。
    # 任一列缺项则全部留空，避免将相邻学生的学号错误写入。
    matched_ids = (
        [item["student_id"] for item in id_entries]
        if len(id_entries) == len(name_entries)
        else [""] * len(name_entries)
    )
    grouped = {}
    for index, class_entry in enumerate(class_entries):
        class_name = class_entry["name"]
        entry = grouped.setdefault(class_name, {"students": [], "student_ids": []})
        entry["students"].append(name_entries[index]["name"])
        entry["student_ids"].append(matched_ids[index])

    return [
        {
            "class_name": class_name,
            "students": value["students"],
            "student_ids": value["student_ids"],
        }
        for class_name, value in grouped.items()
    ]


def recover_id_anchored_students(raw_lines, fields: dict) -> dict:
    """Recover table rows from class/name/10-digit-ID order.

    OCR column grouping can drift into the right-side counsellor columns. A
    student name is accepted only after its class and before its 10-digit ID.
    """
    values = []
    for line in raw_lines or []:
        value = str(line.get("text") or "") if isinstance(line, dict) else str(line or "")
        value = re.sub(r"\s+", "", value)
        if value:
            values.append(value)

    class_pattern = re.compile(r"^[\u4e00-\u9fffA-Za-z·]+(?:20|21|22|23|24|25|26)\d{2}$")
    header_words = {"班级", "姓名", "学号", "辅导员", "辅导联系方式", "联系方式"}
    recovered = []
    for index, value in enumerate(values):
        student_id = re.sub(r"\D", "", value)
        if not re.fullmatch(r"2\d{9}", student_id):
            continue
        class_index = next((cursor for cursor in range(index - 1, max(-1, index - 7), -1)
                            if class_pattern.fullmatch(values[cursor])), None)
        if class_index is None:
            continue
        student_name = "".join(
            candidate for candidate in values[class_index + 1:index]
            if candidate not in header_words and not re.search(r"\d", candidate)
            and re.search(r"[\u4e00-\u9fff]", candidate)
        )
        if student_name:
            recovered.append((values[class_index], student_name, student_id))

    # Multiple class/name/ID triples prove this is a table. Non-table slips
    # retain the existing conservative extraction path.
    if len(recovered) < 2:
        return fields

    groups, seen, students, student_ids = {}, set(), [], []
    for class_name, student_name, student_id in recovered:
        key = (class_name, student_name, student_id)
        if key in seen:
            continue
        seen.add(key)
        group = groups.setdefault(class_name, {"class_name": class_name, "students": [], "student_ids": []})
        group["students"].append(student_name)
        group["student_ids"].append(student_id)
        students.append(student_name)
        student_ids.append(student_id)

    fields["class_students"] = list(groups.values())
    fields["classes"] = list(groups.keys())
    fields["students"] = students
    fields["student_ids"] = student_ids
    return fields



def parse_fields(text: str, raw_lines=None):
    # 手机请假系统详情页没有名单表。之前会把页面标签当成人名；此处宁可
    # 留空给工作人员补录，也绝不写入错误学生。
    mobile_leave_form = _looks_like_mobile_leave_form(text)
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
    if mobile_leave_form:
        fields["suggested_notes"] = "该图片是请假系统详情页，未检测到可安全提取的学生名单，请人工填写。"
        return fields

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
    class_students = _sanitize_class_students(class_students)
    if class_students:
        fields["class_students"] = class_students
        fields["classes"] = [item["class_name"] for item in class_students]
        for item in class_students:
            for name in item["students"]:
                if name not in fields["students"]:
                    fields["students"].append(name)
            for sid in item.get("student_ids", []):
                if sid and sid not in fields["student_ids"]:
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
    # 坐标列识别已经得出名单时不能再让文本顺序兜底覆盖它；后者在斜拍表格中
    # 会把相邻姓名拼成一个人。只有没有结构化名单时才尝试补救。
    if not fields["class_students"]:
        fields = recover_id_anchored_students(raw_lines, fields)
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
    prepared_path, image_processing = prepare_for_ocr(image_path, output_path.parent)
    ocr_result, _ = engine(str(prepared_path))
    # 照片矫正不能降低原图可识别性；矫正结果为空时回退原图再识别一次。
    if not ocr_result and prepared_path != image_path:
        ocr_result, _ = engine(str(image_path))

    lines = []
    raw_lines = []
    if ocr_result:
        for box, text, score in ocr_result:
            if text is None:
                continue
            text_value = str(text).strip()
            lines.append({"text": text_value, "score": float(score) if score is not None else None})
            center_x = sum(point[0] for point in box) / len(box)
            center_y = sum(point[1] for point in box) / len(box)
            cells = image_processing.get("table_cells", [])
            cell = next((candidate for candidate in cells if candidate[0] <= center_x <= candidate[2] and candidate[1] <= center_y <= candidate[3]), None)
            raw_lines.append({
                "text": text_value,
                "score": float(score) if score is not None else None,
                "box": [[int(x), int(y)] for x, y in box],
                "cell": cell,
            })

    full_text = "\n".join(line["text"] for line in lines)
    fields = {"activity_name": "", "classes": [], "students": [], "start_time": "", "end_time": "",
              "counselor_signature": False, "official_seal": False, "teacher_signature": False,
              "cover_line": "", "suggested_notes": ""}
    if lines:
        fields = parse_fields(full_text, raw_lines)

    result = {
        "ok": True,
        "lines": lines,
        "fields": fields,
        "engine": "RapidOCR + OpenCV",
        "image_processing": image_processing,
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
