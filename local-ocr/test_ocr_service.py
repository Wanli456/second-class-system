import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("ocr_service.py")
SPEC = importlib.util.spec_from_file_location("ocr_service", MODULE_PATH)
OCR_SERVICE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(OCR_SERVICE)


class TableStudentExtractionTest(unittest.TestCase):
    def test_excludes_adviser_column_when_table_has_no_student_id_column(self):
        raw_lines = [
            {"text": "班级", "box": [[20, 20]]},
            {"text": "姓名", "box": [[200, 20]]},
            {"text": "联系方式", "box": [[380, 20]]},
            {"text": "辅导员姓名", "box": [[620, 20]]},
            {"text": "虚拟2531", "box": [[20, 80]], "cell": [20, 70, 150, 110]},
            {"text": "刘阳", "box": [[200, 80]], "cell": [180, 70, 350, 110]},
            {"text": "李林平", "box": [[620, 80]], "cell": [600, 70, 760, 110]},
        ]
        self.assertEqual(
            OCR_SERVICE._extract_table_class_students_with_boxes(raw_lines),
            [{"class_name": "虚拟2531", "students": ["刘阳"], "student_ids": [""]}],
        )

    def test_headerless_table_excludes_right_side_counsellor(self):
        raw_lines = [
            {"text": "计应2532", "box": [[20, 10]]},
            {"text": "陈雅茹", "box": [[220, 10]]},
            {"text": "2505011236", "box": [[360, 10]]},
            {"text": "17738255948", "box": [[520, 10]]},
            {"text": "何明霞", "box": [[700, 10]]},
            {"text": "18343090648", "box": [[860, 10]]},
        ]
        self.assertEqual(
            OCR_SERVICE._extract_table_class_students_with_boxes(raw_lines),
            [{"class_name": "计应2532", "students": ["陈雅茹"], "student_ids": ["2505011236"]}],
        )

    def test_drops_mobile_leave_form_labels_but_keeps_a_real_name(self):
        groups = [{
            "class_name": "计应2531",
            "students": ["请假信息", "请假天数", "杨俊杰", "手机号", "续假申请"],
            "student_ids": ["", "", "2505011123", "", ""],
        }]
        self.assertEqual(
            OCR_SERVICE._sanitize_class_students(groups),
            [{"class_name": "计应2531", "students": ["杨俊杰"], "student_ids": ["2505011123"]}],
        )

    def test_mobile_leave_detail_does_not_create_false_students(self):
        sample = chr(10).join(["请假信息", "请假天数", "是否出校", "请假事由", "手机号", "计应2531"])
        fields = OCR_SERVICE.parse_fields(sample)
        self.assertEqual(fields["students"], [])
        self.assertEqual(fields["class_students"], [])
        self.assertIn("人工填写", fields["suggested_notes"])


if __name__ == "__main__":
    unittest.main()
