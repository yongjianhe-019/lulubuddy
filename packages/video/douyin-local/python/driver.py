#!/usr/bin/env python3
"""抖音竖屏科普产线驱动。

用法：
    driver.py scaffold --project <name> --lesson <id> --title "<title>" --template <series> --python <py>
    driver.py render   --project <name> --lesson <id> --python <py> --tts <tts.py> --qa <qa.py> [--bgm <mp3>] [--every 4]

最后一行输出 JSON，供 dsh 的 douyin_render 读取。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("DOUYIN_ROOT", str(Path.home() / "PycharmProjects/teaching-video/works")))


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def run(cmd: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
    log(f"$ {' '.join(str(c) for c in cmd)}")
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True, timeout=timeout)


def add_chars(timings_path: Path) -> None:
    """tts.py 只给词级时间，cine 的字幕要逐字时间。"""
    data = json.loads(timings_path.read_text())
    for beat in data["beats"].values():
        n = len(beat["text"])
        chars: list[float | None] = [None] * n
        for word in beat.get("words", []):
            i0, i1 = word["i0"], word["i1"]
            span = max(1, i1 - i0)
            for k in range(i0, min(i1, n)):
                chars[k] = word["start"] + (word["end"] - word["start"]) * (k - i0) / span
        last = beat["start"]
        for i in range(n):
            chars[i] = last if chars[i] is None else chars[i]
            last = chars[i]
        beat["chars"] = [round(c, 3) for c in chars]
    timings_path.write_text(json.dumps(data, ensure_ascii=False, indent=1))


def cmd_scaffold(a: argparse.Namespace) -> dict:
    template = Path(a.template).expanduser()
    if not (template / "cine").is_dir():
        return {"ok": False, "error": f"template 缺少 cine/：{template}"}
    project = ROOT / a.project
    if project.exists():
        shutil.rmtree(project)
    project.mkdir(parents=True)
    for name in ("cine", "series.json"):
        src = template / name
        if src.is_dir():
            shutil.copytree(src, project / name)
        elif src.exists():
            shutil.copy2(src, project / name)
    lesson_dir = project / "lessons" / a.lesson
    (lesson_dir / "assets" / "audio").mkdir(parents=True, exist_ok=True)
    (project / "lessons" / a.lesson / "build").mkdir(parents=True, exist_ok=True)
    # 默认骨架：把原工程的分镜与稿件搬过来当起点
    for name in ("film-v.js", "narration.json"):
        src = template / "lessons" / "02" / name
        if src.exists():
            shutil.copy2(src, lesson_dir / name)
    if (a.title or "").strip():
        (project / "series.json").write_text(json.dumps({
            "title": a.title, "author": "", "status": "draft",
            "status_label": "草稿", "tagline": "", "facts": [],
            "lessons_sub": "", "footer": "", "lessons": [a.lesson],
        }, ensure_ascii=False, indent=1))
    return {
        "ok": True,
        "project": str(project),
        "lesson_dir": str(lesson_dir),
        "narration": str(lesson_dir / "narration.json"),
        "film": str(lesson_dir / "film-v.js"),
        "bgm_dir": str(lesson_dir / "assets" / "audio"),
        "next": "写 narration.json 与 film-v.js，放一条 BGM 到 assets/audio/bgm.mp3，然后 douyin_render。",
    }


def cmd_render(a: argparse.Namespace) -> dict:
    project = ROOT / a.project
    lesson_dir = project / "lessons" / a.lesson
    build = lesson_dir / "build"
    if not lesson_dir.is_dir():
        return {"ok": False, "error": f"没有这个 lesson：{lesson_dir}"}
    build.mkdir(parents=True, exist_ok=True)
    python = a.python

    bgm = Path(a.bgm).expanduser() if a.bgm else lesson_dir / "assets" / "audio" / "bgm.mp3"
    if not bgm.exists():
        return {"ok": False, "error": f"缺少 BGM：{bgm}（放到 assets/audio/bgm.mp3 或用 --bgm 指定）"}

    started = time.time()

    # 1) 配音
    r = run([python, a.tts, str(lesson_dir / "narration.json"), str(lesson_dir), "--gap", "0.45", "--lead", "0.5"])
    if r.returncode != 0:
        return {"ok": False, "error": f"tts 失败：{(r.stderr or r.stdout)[-800:]}"}
    timings_src = lesson_dir / "timings.json"
    if not timings_src.exists():
        return {"ok": False, "error": "tts 没有产出 timings.json"}
    add_chars(timings_src)
    shutil.copy2(timings_src, build / "timings.json")

    # 2) 本地静态服务（cine 页面 + 资源）
    port = free_port()
    server = subprocess.Popen([python, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                              cwd=str(project), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.5)
        # 3) 逐帧渲染（竖屏 1080x1920）
        r = run([python, str(project / "cine/tools/record.py"), a.lesson,
                 "--film", "film-v", "--w", "1080", "--h", "1920", "--port", str(port)], timeout=a.render_timeout)
        if r.returncode != 0:
            return {"ok": False, "error": f"渲染失败：{(r.stderr or r.stdout)[-1200:]}"}
    finally:
        server.terminate()

    # 4) 混音
    shutil.copy2(lesson_dir / "narration.wav", build / "narration.wav")
    r = run([python, str(project / "cine/tools/finish.py"), a.lesson], timeout=1800)
    if r.returncode != 0:
        return {"ok": False, "error": f"混音失败：{(r.stderr or r.stdout)[-1200:]}"}

    video = build / f"lesson{a.lesson}.mp4"
    if not video.exists():
        return {"ok": False, "error": f"没有生成成片：{video}"}

    # 5) 质检
    qa_dir = lesson_dir / "qa"
    r = run([python, a.qa, str(video), "--every", str(a.every), "--out", str(qa_dir)], timeout=1800)
    qa_text = (r.stdout or "") + (r.stderr or "")

    def grab(pattern: str) -> str | None:
        m = re.search(pattern, qa_text)
        return m.group(1) if m else None

    duration = None
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)])
    if p.returncode == 0:
        duration = p.stdout.strip()

    out_dir = lesson_dir / "output"
    out_dir.mkdir(exist_ok=True)
    final = out_dir / f"douyin-{a.project}-{a.lesson}.mp4"
    shutil.copy2(video, final)

    return {
        "ok": True,
        "video": str(final),
        "duration_s": float(duration) if duration else None,
        "loudness": grab(r"响度\s+(-?[\d.]+)\s+LUFS"),
        "true_peak": grab(r"真峰值\s+(-?[\d.]+)\s+dBTP"),
        "freeze": "无超过 3 秒的静止" if "没有超过 3 秒的静止画面" in qa_text else "有静止段落，见 qa/freeze.txt",
        "qa_dir": str(qa_dir),
        "elapsed_s": round(time.time() - started, 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sc = sub.add_parser("scaffold")
    sc.add_argument("--project", required=True)
    sc.add_argument("--lesson", default="01")
    sc.add_argument("--title", default="")
    sc.add_argument("--template", required=True)
    sc.add_argument("--python", default="python3")

    rd = sub.add_parser("render")
    rd.add_argument("--project", required=True)
    rd.add_argument("--lesson", required=True)
    rd.add_argument("--python", default="python3")
    rd.add_argument("--tts", required=True)
    rd.add_argument("--qa", required=True)
    rd.add_argument("--bgm", default=None)
    rd.add_argument("--every", default="4")
    rd.add_argument("--render-timeout", type=int, default=7200)

    a = ap.parse_args()
    try:
        result = cmd_scaffold(a) if a.cmd == "scaffold" else cmd_render(a)
    except Exception as error:  # noqa: BLE001 - the driver reports one JSON line either way
        result = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
