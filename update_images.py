#!/usr/bin/env python3
"""
update_images.py — Tetsuography 画像リスト更新スクリプト

【使い方】
1. images/full/  に JPG を追加（フルサイズ）
2. images/thumb/ に WebP を追加（サムネイル）
   ※ ファイル名の拡張子以外は同じにすること
   　 例: L1004688.jpg → L1004688.webp
3. このスクリプトを実行:
       python3 update_images.py
4. GitHub Desktop で commit & push

【必要なもの】
   pip3 install Pillow
"""

import os
import json
from datetime import datetime, timezone

try:
    from PIL import Image
except ImportError:
    print("エラー: Pillow がインストールされていません。")
    print("  pip3 install Pillow  を実行してください。")
    exit(1)

THUMB_DIR   = "images/thumb"
FULL_DIR    = "images/full"
OUTPUT_FILE = "images.json"
THUMB_EXTS  = {".webp", ".jpg", ".jpeg", ".png"}
FULL_EXTS   = {".jpg", ".jpeg", ".png", ".webp"}


def get_aspect(path):
    try:
        with Image.open(path) as img:
            w, h = img.size
            return round(w / h, 4)
    except Exception as e:
        print(f"  警告: {path} のサイズ取得に失敗 ({e})")
        return 1.5


def find_full(base):
    for ext in FULL_EXTS:
        candidate = os.path.join(FULL_DIR, base + ext)
        if os.path.exists(candidate):
            return base + ext
    return None


def main():
    if not os.path.isdir(THUMB_DIR):
        print(f"エラー: {THUMB_DIR} が見つかりません。")
        exit(1)
    if not os.path.isdir(FULL_DIR):
        print(f"エラー: {FULL_DIR} が見つかりません。")
        exit(1)

    thumbs = sorted(
        f for f in os.listdir(THUMB_DIR)
        if os.path.splitext(f)[1].lower() in THUMB_EXTS and not f.startswith(".")
    )

    images = []
    skipped = []

    for thumb in thumbs:
        base = os.path.splitext(thumb)[0]
        full = find_full(base)

        if not full:
            skipped.append(thumb)
            continue

        thumb_path = os.path.join(THUMB_DIR, thumb)
        asp = get_aspect(thumb_path)

        images.append({
            "file":   full,
            "thumb":  thumb,
            "aspect": asp,
        })
        print(f"  ✓  {thumb}  ({asp})")

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "images": images,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n完了: {len(images)} 枚 → {OUTPUT_FILE}")

    if skipped:
        print(f"\n以下のサムネイルに対応するフルサイズ画像が見つかりませんでした:")
        for s in skipped:
            print(f"  ✗  {s}")


if __name__ == "__main__":
    main()
