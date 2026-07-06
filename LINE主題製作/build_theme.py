#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LINE 主題自動製作引擎
用法:
    python3 build_theme.py <工作資料夾>

工作資料夾內放「命名好的來源照片」，用數字代號：
    i22.jpg  → 生成 i_22.png（聊天背景，自動壓 <1MB）
    i27.png  → 生成 i_27.png + i_27_g.png（灰階，透明底）
    a20.jpg  → 生成 a_20.png
    store.jpg / main.jpg → 生成三種縮圖（store/ios/android）
副檔名 jpg/jpeg/png/webp 皆可。未被替換的 slot 會從 template/ 補齊，湊滿整套。

輸出：
    <工作資料夾>/_上傳版/       （61 個合法主題檔）
    <工作資料夾>_上傳版.zip     （直接上傳 LINE Creator）
"""
import os, sys, json, re, shutil, zipfile
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_PATH = os.path.join(HERE, "theme_spec.json")
TEMPLATE  = os.path.join(HERE, "template")
SRC_EXT = (".jpg", ".jpeg", ".png", ".webp")


# ---------- 影像處理（本專案已驗證的正確版本）----------
def resize_contain(img, size):
    """縮放至 size 內、保持比例、透明底置中（icon / 貼圖用）。"""
    img = img.convert("RGBA")
    img.thumbnail(size, Image.LANCZOS)
    canvas = Image.new("RGBA", size, (255, 255, 255, 0))
    canvas.paste(img, ((size[0]-img.width)//2, (size[1]-img.height)//2), img)
    return canvas


def resize_cover(img, size):
    """裁切填滿 size（聊天背景用）。"""
    img = img.convert("RGBA")
    sr, tr = img.width/img.height, size[0]/size[1]
    if sr > tr:
        nh = size[1]; nw = round(nh*sr)
    else:
        nw = size[0]; nh = round(nw/sr)
    img = img.resize((nw, nh), Image.LANCZOS)
    x, y = (nw-size[0])//2, (nh-size[1])//2
    return img.crop((x, y, x+size[0], y+size[1]))


def to_gray_rgba(img, size):
    """灰階但保留 Alpha（避免透明底變黑塊），再 contain 置中。"""
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    lum = Image.merge("RGB", (r, g, b)).convert("L")
    gray = Image.merge("RGBA", (lum, lum, lum, a))
    return resize_contain(gray, size)


def save_compressed(img, path, max_kb):
    """存 PNG，超過 max_kb 就逐步 quantize 降色壓縮。"""
    img.save(path, "PNG", optimize=True)
    if os.path.getsize(path) <= max_kb*1024:
        return
    for colors in (256, 200, 160, 128, 96, 64):
        q = img.convert("RGBA").quantize(colors=colors, method=Image.FASTOCTREE)
        q.save(path, "PNG", optimize=True)
        if os.path.getsize(path) <= max_kb*1024:
            return


# ---------- 來源檔對應 ----------
def parse_source_name(fname):
    """iXX / aXX → slot 名 i_XX / a_XX；store/main → thumbnail 標記。"""
    stem = os.path.splitext(fname)[0].lower().strip()
    if stem in ("store", "main", "thumbnail", "縮圖", "主圖"):
        return "THUMB"
    m = re.fullmatch(r"([ia])[_-]?(\d{1,2})", stem)
    if m:
        return f"{m.group(1)}_{int(m.group(2)):02d}"
    return None


def find_sources(workdir):
    """回傳 {slot: 來源路徑}，THUMB 特別處理。"""
    found = {}
    for f in sorted(os.listdir(workdir)):
        p = os.path.join(workdir, f)
        if not os.path.isfile(p) or os.path.splitext(f)[1].lower() not in SRC_EXT:
            continue
        slot = parse_source_name(f)
        if slot:
            found[slot] = p
    return found


# ---------- 主流程 ----------
def build(workdir):
    workdir = os.path.abspath(workdir)
    spec = json.load(open(SPEC_PATH, encoding="utf-8"))
    out = os.path.join(workdir, "_上傳版")
    os.makedirs(out, exist_ok=True)

    sources = find_sources(workdir)
    thumb_src = sources.pop("THUMB", None)
    replaced = []

    # 1) 逐一產出所有 slot（有來源就用新照片，否則複製範本）
    for slot, cfg in spec["slots"].items():
        target = os.path.join(out, slot + ".png")
        gray_target = os.path.join(out, slot + "_g.png") if cfg.get("gray") else None
        if slot in sources:
            src = Image.open(sources[slot])
            if cfg["mode"] == "cover":
                img = resize_cover(src, cfg["size"])
                save_compressed(img, target, cfg.get("max_kb", 900))
            else:
                resize_contain(src, cfg["size"]).save(target, "PNG")
            if gray_target:
                to_gray_rgba(src, cfg["gray"]).save(gray_target, "PNG")
            replaced.append(slot)
        else:
            shutil.copy2(os.path.join(TEMPLATE, slot + ".png"), target)
            if gray_target:
                shutil.copy2(os.path.join(TEMPLATE, slot + "_g.png"), gray_target)

    # 2) 縮圖
    for tname, tcfg in spec["thumbnails"].items():
        target = os.path.join(out, tname + ".png")
        if thumb_src:
            resize_contain(Image.open(thumb_src), tcfg["size"]).save(target, "PNG")
        else:
            shutil.copy2(os.path.join(TEMPLATE, tname + ".png"), target)
    if thumb_src:
        replaced.append("thumbnails")

    # 3) 打包 ZIP（明確列檔，杜絕來源雜檔混入）
    zip_path = workdir + "_上傳版.zip"
    names = [f for f in sorted(os.listdir(out)) if f.endswith(".png")]
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.write(os.path.join(out, n), n)

    # 4) 驗證報告
    print(f"\n✅ 完成！輸出 {len(names)} 檔 → {out}")
    print(f"📦 ZIP: {zip_path}  ({os.path.getsize(zip_path)//1024} KB)")
    print(f"🔄 已替換: {', '.join(replaced) if replaced else '（無，全部沿用範本）'}")
    problems = []
    if len(names) != 61:
        problems.append(f"檔數 {len(names)} ≠ 61")
    for slot, cfg in spec["slots"].items():
        if cfg["mode"] == "cover":
            kb = os.path.getsize(os.path.join(out, slot+".png"))//1024
            flag = "⚠️>1MB" if kb > 1024 else "ok"
            print(f"   背景 {slot}: {kb} KB [{flag}]")
            if kb > 1024:
                problems.append(f"{slot} {kb}KB 超過 1MB")
    print("🔎 檢查:", "全部通過 ✅" if not problems else "；".join(problems))
    return not problems


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python3 build_theme.py <工作資料夾>")
        sys.exit(1)
    ok = build(sys.argv[1])
    sys.exit(0 if ok else 2)
