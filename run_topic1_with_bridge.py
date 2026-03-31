import base64
import json
import os
import re
import subprocess

import cv2
import ddddocr
import requests
import urllib3
from requests.exceptions import SSLError

BASE = "https://match2025.yuanrenxue.cn"
CAPTCHA_JPG_URL = f"{BASE}/match2025/topic/1_captcha_jpg"
CAPTCHA_CHECK_URL = f"{BASE}/match2025/topic/1_captcha_check"

cookies = {
    "Hm_lvt_3e4ffd7a3b6387fe4632831f1230b518": "1774939667",
    "HMACCOUNT": "02CE5E3347972BDA",
    "sessionid": "afxvs8yh6ym0ktjizsd4x5fwt4llna12",
    "Hm_lpvt_3e4ffd7a3b6387fe4632831f1230b518": "1774939838",
}

headers = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://match2025.yuanrenxue.cn",
    "Pragma": "no-cache",
    "Referer": "https://match2025.yuanrenxue.cn/match2025/topic/1",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def node_json(args):
    cp = subprocess.run(
        ["node", "yrx_topic1_bridge.js"] + args,
        capture_output=True,
        text=True,
        check=False,
    )
    m = re.search(r"\{.*\}", cp.stdout or "", re.S)
    if not m:
        raise RuntimeError(f"node output invalid:\nstdout={cp.stdout}\nstderr={cp.stderr}")
    obj = json.loads(m.group(0))
    if not obj.get("ok"):
        raise RuntimeError(f"node returned error: {obj}")
    return obj


def decode_b64_loose(s):
    s = (s or "").strip()
    if "base64," in s:
        s = s.split("base64,", 1)[1]
    s = re.sub(r"\s+", "", s)
    s = s.replace("-", "+").replace("_", "/")
    s = re.sub(r"[^A-Za-z0-9+/=]", "", s)
    s = s.rstrip("=")
    while len(s) % 4 == 1 and s:
        s = s[:-1]
    s += "=" * ((4 - len(s) % 4) % 4)
    return base64.b64decode(s, validate=False)


def ocr_candidates(png_path):
    img = cv2.imread(png_path)
    if img is None:
        return []
    up = cv2.resize(img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mats = [up, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)]

    ocr = ddddocr.DdddOcr(show_ad=False, beta=True)
    cands = []
    for mat in mats:
        ok, buf = cv2.imencode(".png", mat)
        if not ok:
            continue
        raw = ocr.classification(buf.tobytes())
        cleaned = re.sub(r"[^A-Za-z0-9]", "", raw).lower()
        if len(cleaned) >= 4:
            cands.append(cleaned[:4])

    seen = set()
    out = []
    for c in cands:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def main():
    os.makedirs("runs", exist_ok=True)
    sess = requests.Session()
    tls_verify = True

    def safe_post(url, **kwargs):
        nonlocal tls_verify
        try:
            return sess.post(url, verify=tls_verify, **kwargs)
        except SSLError:
            # Training-site fallback for environments missing local CA chain.
            tls_verify = False
            print("[tls] cert verify failed, fallback to verify=False")
            return sess.post(url, verify=tls_verify, **kwargs)

    a = node_json(["param-a"])["a"]
    print("[1] a =", a)

    r = safe_post(CAPTCHA_JPG_URL, headers=headers, cookies=cookies, data={"a": a}, timeout=30)
    r.raise_for_status()
    j = r.json()

    gif_path = "runs/topic1_captcha.gif"
    with open(gif_path, "wb") as f:
        f.write(decode_b64_loose(j.get("result", "")))
    print("[2] gif saved:", gif_path)

    longest = node_json(["longest-png", "--gif", gif_path, "--out-png", "runs/topic1_longest_frame.png"])
    png_path = longest["pngPath"]
    print("[3] longest frame:", longest["frameIndex"], "delay=", longest["delay"], "count=", longest["frameCount"])

    candidates = ocr_candidates(png_path)
    print("[4] candidates:", candidates)
    if not candidates:
        print("no candidates")
        return

    cand = candidates[0]
    enc = node_json(["encode-text", "--value", cand])["text"]
    rc = safe_post(CAPTCHA_CHECK_URL, headers=headers, cookies=cookies, data={"text": enc}, timeout=30)
    rc.raise_for_status()
    print(f"[5] try {cand} -> {rc.text}")
    try:
        if rc.json().get("success") is True:
            print("PASS:", cand)
        else:
            print("FAILED:", cand)
    except Exception:
        print("FAILED:", cand)


if __name__ == "__main__":
    main()
