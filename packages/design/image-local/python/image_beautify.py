#!/usr/bin/env python3
"""Local photo beautification in three editorial treatments.

This is a deterministic fallback for the three prompt/image-generation skills:
photo-revival, pixel-style-poster, and gc-minimal-zine-poster. It preserves the
photo as a material on paper instead of calling an external image model, so the
result is a designed treatment rather than a redrawn illustration.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ACCENTS = {
    "revival": "#6f9fb0",
    "pixel": "#1f6f8b",
    "zine": "#d24b3e",
}

FONT_CANDIDATES = {
    "hand": [
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/00bfc46ccb002b730e29def5116e0a571fb617d8.asset/AssetData/Hannotate.ttc",
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/4a418d1fa4860652a3241e8ee457806c8557fc64.asset/AssetData/Yuanti.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ],
    "serif": [
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/4a418d1fa4860652a3241e8ee457806c8557fc64.asset/AssetData/Yuanti.ttc",
    ],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[kind]:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def paper(width: int, height: int, color: tuple[int, int, int], grain: float = 3.0) -> Image.Image:
    yy, xx = np.mgrid[0:height, 0:width]
    base = np.zeros((height, width, 3), dtype=np.float32)
    base[..., 0], base[..., 1], base[..., 2] = color
    vignette = 1.0 - 0.055 * (((xx - width / 2) / width) ** 2 + ((yy - height / 2) / height) ** 2)
    noise = np.random.default_rng(19).normal(0, grain, (height, width, 1))
    base = np.clip(base * vignette[..., None] + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(base, "RGB")


def fit_photo(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))


def torn_mask(size: tuple[int, int], seed: int = 4) -> Image.Image:
    w, h = size
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    rng = random.Random(seed)
    pts = []
    for i in range(34):
        a = 2 * math.pi * i / 34
        r = 0.44 + rng.uniform(-0.018, 0.018)
        pts.append((w / 2 + math.cos(a) * w * r, h / 2 + math.sin(a) * h * r))
    d.polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(1.2))


def caption(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, max_width: int, size: int, fill: tuple[int, int, int], fnt: ImageFont.FreeTypeFont) -> None:
    if not text:
        return
    line = ""
    lines: list[str] = []
    for char in text:
        trial = line + char
        if draw.textlength(trial, font=fnt) > max_width and line:
            lines.append(line)
            line = char
        else:
            line = trial
    if line:
        lines.append(line)
    for index, part in enumerate(lines[:2]):
        draw.text((x, y + index * int(size * 1.5)), part, font=fnt, fill=fill)


def revival(source: Image.Image, output: Path, text: str, accent: str) -> None:
    W, H = 1200, 1600
    page = paper(W, H, (251, 249, 242), 2.4)
    # Draw a small, hand-made illustration-like cluster: stylization plus pencil
    # line, contained on the paper rather than bleeding to the edge.
    size = 470
    photo = fit_photo(source, (size, size))
    arr = cv2.cvtColor(np.array(photo), cv2.COLOR_RGB2BGR)
    color = cv2.stylization(arr, sigma_s=60, sigma_r=0.35)
    _gray, sketch_bgr = cv2.pencilSketch(arr, sigma_s=70, sigma_r=0.06, shade_factor=0.06)
    color = cv2.cvtColor(color, cv2.COLOR_BGR2RGB)
    sketch = cv2.cvtColor(sketch_bgr, cv2.COLOR_BGR2RGB)
    mixed = (color.astype(np.float32) * 0.62 + sketch.astype(np.float32) * 0.38).clip(0, 255).astype(np.uint8)
    tile = Image.fromarray(mixed, "RGB").filter(ImageFilter.GaussianBlur(0.35))
    tile.putalpha(torn_mask((size, size), 7))
    page.paste(tile, (118, 690), tile)
    draw = ImageDraw.Draw(page)
    ac = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))
    draw.text((120, 170), "PHOTO REVIVAL", font=font("serif", 26), fill=(116, 104, 85))
    draw.text((120, 226), "一张照片，重新画了一遍", font=font("hand", 48), fill=(53, 44, 34))
    draw.line((120, 320, 420, 320), fill=(180, 166, 140), width=1)
    caption(draw, text or "我记得，那一天。", 120, 1260, 760, 48, (73, 61, 46), font("hand", 48))
    draw.text((120, 1380), "FIELD NOTE / A SMALL MEMORY", font=font("serif", 22), fill=(132, 119, 98))
    draw.ellipse((900, 1270, 916, 1286), fill=ac)
    page.save(output, optimize=True)


def pixel(source: Image.Image, output: Path, text: str, accent: str) -> None:
    W, H = 1200, 1600
    page = paper(W, H, (248, 246, 238), 2.0)
    size = 920
    photo = fit_photo(source, (size, size)).convert("L")
    # Fine bitmap print: downsample to a small grid and rebuild with nearest
    # neighbours, then overlay a dot matrix and scanlines.
    small = photo.resize((92, 92), Image.Resampling.LANCZOS)
    small = ImageEnhance.Contrast(small).enhance(1.35)
    bitmap = small.resize((size, size), Image.Resampling.NEAREST)
    arr = np.array(bitmap, dtype=np.uint8)
    ac = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))
    ink = np.zeros((size, size, 3), dtype=np.uint8)
    ink[..., 0], ink[..., 1], ink[..., 2] = ac
    shade = np.stack([arr] * 3, axis=-1).astype(np.float32) / 255.0
    composed = (ink.astype(np.float32) * (1.0 - shade * 0.82) + 245 * shade * 0.82).clip(0, 255).astype(np.uint8)
    tile = Image.fromarray(composed, "RGB")
    dots = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for y in range(0, size, 7):
        for x in range(0, size, 7):
            v = arr[y, x]
            if v < 120:
                dd.ellipse((x, y, x + 2, y + 2), fill=(*ac, 70))
    tile = Image.alpha_composite(tile.convert("RGBA"), dots)
    scan = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, size, 4):
        sd.line((0, y, size, y), fill=(20, 30, 40, 12))
    tile = Image.alpha_composite(tile, scan)
    page.paste(tile.convert("RGB"), (140, 270))
    draw = ImageDraw.Draw(page)
    draw.text((140, 120), "PIXEL / PRINT STUDY", font=font("serif", 26), fill=(70, 93, 105))
    caption(draw, text or "把生活，编码成一张数字印刷品。", 140, 1250, 900, 42, (38, 52, 60), font("hand", 42))
    draw.text((140, 1390), "DOT MATRIX · SCAN · ONE INK", font=font("serif", 22), fill=(122, 135, 140))
    page.save(output, optimize=True)


def zine(source: Image.Image, output: Path, text: str, accent: str) -> None:
    W, H = 1200, 1500
    page = paper(W, H, (231, 223, 207), 4.0)
    size = (900, 620)
    photo = fit_photo(source, size).convert("L")
    photo = ImageEnhance.Contrast(photo).enhance(1.3)
    # Halftone-ish posterization with a xerox softness and a riso offset.
    arr = np.array(photo, dtype=np.uint8)
    arr = np.where(arr > 150, 245, np.where(arr > 90, 170, 55)).astype(np.uint8)
    base = Image.fromarray(arr, "L").filter(ImageFilter.GaussianBlur(0.45)).convert("RGB")
    ac = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))
    layer = Image.new("RGB", size, ac)
    mask = np.array(base.convert("L"), dtype=np.uint8)
    mask = np.where(mask < 120, 100, 0).astype(np.uint8)
    layer.putalpha(Image.fromarray(mask, "L"))
    base = Image.alpha_composite(base.convert("RGBA"), layer)
    page.paste(base.convert("RGB"), (150, 300))
    # Riso second impression: a slightly offset accent rule and registration marks.
    draw = ImageDraw.Draw(page)
    draw.rectangle((150, 950, 300, 958), fill=ac)
    draw.text((150, 130), "A QUIET PAPER / FIELD NOTE", font=font("serif", 24), fill=(96, 80, 59))
    draw.text((150, 180), "记忆中的旧报纸", font=font("hand", 54), fill=(47, 40, 31))
    caption(draw, text or "把照片里的记忆，贴入一张安静的旧纸。", 150, 980, 900, 42, (60, 50, 38), font("hand", 42))
    draw.text((150, 1080), "HALFTONE · XEROX · RISOGRAPH", font=font("serif", 21), fill=(125, 108, 84))
    draw.line((150, 1160, 1050, 1160), fill=(155, 137, 108), width=1)
    page.save(output, optimize=True)


def main() -> int:
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    source = Image.open(request["source"]).convert("RGB")
    source = ImageOps.exif_transpose(source)
    style = request.get("style", "revival")
    if style not in ("revival", "pixel", "zine"):
        raise SystemExit(f"unknown style: {style}")
    accent = request.get("accent") or ACCENTS[style]
    output = Path(request["output"])
    output.parent.mkdir(parents=True, exist_ok=True)
    text = str(request.get("caption") or "")
    if style == "revival":
        revival(source, output, text, accent)
    elif style == "pixel":
        pixel(source, output, text, accent)
    else:
        zine(source, output, text, accent)
    print(json.dumps({"ok": True, "output": str(output), "style": style, "accent": accent}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
