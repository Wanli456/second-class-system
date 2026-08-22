"""本地免费 AI 第一层：图片感知哈希（dHash / pHash）。

用法:
    python image_hash.py <输出JSON路径> <图片1> <图片2> ...

输出:
    {
        "ok": true,
        "hashes": [
            {"index": 0, "path": "...", "dhash": "0123456789abcdef", "phash": "..."},
            ...
        ]
    }
"""
import json
import sys

try:
    from PIL import Image
except Exception as exc:  # noqa: BLE001
    print(json.dumps({"ok": False, "error": f"缺少 Pillow: {exc}"}), file=sys.stderr)
    sys.exit(2)


def dhash_hex(image: Image.Image) -> str:
    gray = image.convert("L").resize((9, 8), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    bits = []
    for row in range(8):
        row_start = row * 9
        for col in range(8):
            bits.append("1" if pixels[row_start + col] > pixels[row_start + col + 1] else "0")
    value = int("".join(bits), 2)
    return f"{value:016x}"


def phash_hex(image: Image.Image) -> str:
    gray = image.convert("L").resize((8, 8), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    mean = sum(pixels) / len(pixels)
    bits = ["1" if pixel > mean else "0" for pixel in pixels]
    value = int("".join(bits), 2)
    return f"{value:016x}"


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "缺少输出文件或图片参数"}), file=sys.stderr)
        return 2

    output_path = sys.argv[1]
    image_paths = sys.argv[2:]
    hashes = []
    for index, image_path in enumerate(image_paths):
        try:
            with Image.open(image_path) as image:
                hashes.append({
                    "index": index,
                    "path": image_path,
                    "dhash": dhash_hex(image),
                    "phash": phash_hex(image),
                })
        except Exception as exc:  # noqa: BLE001
            hashes.append({"index": index, "path": image_path, "error": str(exc)})

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump({"ok": True, "hashes": hashes}, file, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())