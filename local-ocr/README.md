# 假条图片本地 OCR 测试

本目录用于在**本地**验证开源免费 OCR（RapidOCR / ONNX Runtime），方便后续在雨云服务器部署前先跑通识别效果。

## 文件

| 文件 | 说明 |
| --- | --- |
| `ocr_test.py` | OCR 测试脚本：读取图片，输出每行文字 + 置信度 + JSON |
| `sample.png` | 假条测试样例（中文，Windows 微软雅黑生成） |

## 使用（已有 `.ocr-venv`）

在项目根目录 `F:\二课活动管理系统` 执行：

```powershell
.\.ocr-venv\Scripts\activate
python .\local-ocr\ocr_test.py .\local-ocr\sample.png
```

不激活也可以直接：

```powershell
.\.ocr-venv\Scripts\python.exe .\local-ocr\ocr_test.py .\local-ocr\sample.png
```

替换成任意假条图片路径即可：

```powershell
.\.ocr-venv\Scripts\python.exe .\local-ocr\ocr_test.py "C:\path\to\假条照片.jpg"
```

## 虚拟环境重建（可选）

```powershell
python -m venv .ocr-venv
.\.ocr-venv\Scripts\python.exe -m pip install rapidocr-onnxruntime pillow
```

## 当前本地测试结果

在 `sample.png` 上识别成功，核心字段均能识别：

- `请假条`
- `兹有计算机2101班张三、李四、王五等3人，`
- `因参加校园人工智能创新周请假，`
- `请假时间：2026年08月22日13:00－17:00。`
- `辅导员签字：陈思远公章：已盖`

识别置信度均在 `0.94 - 0.999` 之间。**注意：真实照片受拍摄角度、反光、印章遮挡影响，需要在你的真实假条样本上再测一轮；另外 `1/l`、`0/O` 这类形近字符也必须以人工核对为准。**