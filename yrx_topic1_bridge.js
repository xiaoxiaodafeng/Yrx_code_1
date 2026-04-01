const https = require("https");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { webcrypto } = require("crypto");
const { parseGIF, decompressFrames } = require("gifuct-js");
const { PNG } = require("pngjs");

const PAGE_URL = "https://match2025.yuanrenxue.cn/match2025/topic/1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0";
const DUMMY_GIF_BASE64 = "R0lGODlhAQABAAAAACw=";

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": UA,
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

async function buildParamA() {
  const html = await fetchText(PAGE_URL);
  const scriptSrcs = [
    ...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi),
  ].map((m) => m[1]);
  const inlineScripts = [
    ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1]);

  const jqueryRel = scriptSrcs.find((s) => s.includes("/jquery/jquery.js"));
  if (!jqueryRel) throw new Error("jquery script not found");
  const jqueryCode = await fetchText(new URL(jqueryRel, PAGE_URL).href);

  const dom = new JSDOM(html, {
    url: PAGE_URL,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;

  Object.defineProperty(w.navigator, "userAgent", {
    value: UA,
    configurable: true,
  });
  w.crypto = webcrypto;
  w.alert = () => {};
  w.atob = (s) => Buffer.from(String(s || ""), "base64").toString("binary");
  w.btoa = (s) => Buffer.from(String(s || ""), "binary").toString("base64");
  w.eval(jqueryCode);

  const calls = [];
  w.$.ajax = (opts) => {
    calls.push({ url: opts.url, type: opts.type, data: opts.data });
    if (typeof opts.success === "function") {
      if ((opts.url || "").includes("/api/user")) opts.success({ status: 0 });
      else if ((opts.url || "").includes("/match2025/logo")) opts.success(String(Date.now()));
      else if ((opts.url || "").includes("1_captcha_jpg")) opts.success({ result: DUMMY_GIF_BASE64 });
      else opts.success({});
    }
    return { abort() {} };
  };

  for (const code of inlineScripts) {
    if (!code || !code.trim()) continue;
    try {
      w.eval(code);
    } catch (_) {}
  }

  const cap = calls.find((x) => (x.url || "").includes("1_captcha_jpg"));
  if (!cap || !cap.data || !cap.data.a) throw new Error("failed to generate param a");
  return cap.data.a;
}

function extractLongestPng(gifPath, outPngPath) {
  const gifBuffer = fs.readFileSync(gifPath);
  const gif = parseGIF(gifBuffer);
  const frames = decompressFrames(gif, true);
  if (!frames.length) throw new Error("gif has no frames");

  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const canvas = new Uint8Array(width * height * 4);

  let bestDelay = -1;
  let bestFrameIndex = 0;
  let bestPng = null;

  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    const { left, top, width: fw, height: fh } = f.dims;
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        const src = (y * fw + x) * 4;
        const dst = ((top + y) * width + (left + x)) * 4;
        canvas[dst] = f.patch[src];
        canvas[dst + 1] = f.patch[src + 1];
        canvas[dst + 2] = f.patch[src + 2];
        canvas[dst + 3] = f.patch[src + 3];
      }
    }
    const delay = Number(f.delay || 0);
    if (delay > bestDelay) {
      bestDelay = delay;
      bestFrameIndex = i;
      const png = new PNG({ width, height });
      png.data = Buffer.from(canvas);
      bestPng = PNG.sync.write(png);
    }
  }

  const absOut = path.resolve(outPngPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, bestPng);
  return { frameIndex: bestFrameIndex, delay: bestDelay, pngPath: absOut, frameCount: frames.length };
}

function parseArgs(argv) {
  const out = {
    gif: "",
    outPng: "runs/topic1_longest_frame.png",
    value: "",
    logo: "",
    captchaResult: "",
    forceA: "",
    cookie: "",
  };
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--gif" && argv[i + 1]) out.gif = argv[++i];
    else if (a === "--out-png" && argv[i + 1]) out.outPng = argv[++i];
    else if (a === "--value" && argv[i + 1]) out.value = String(argv[++i]);
    else if (a === "--logo" && argv[i + 1]) out.logo = String(argv[++i]);
    else if (a === "--captcha-result" && argv[i + 1]) out.captchaResult = String(argv[++i]);
    else if (a === "--force-a" && argv[i + 1]) out.forceA = String(argv[++i]);
    else if (a === "--cookie" && argv[i + 1]) out.cookie = String(argv[++i]);
  }
  return out;
}

async function encodeCheckText(value, options = {}) {
  const html = await fetchText(PAGE_URL);
  const scriptSrcs = [
    ...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi),
  ].map((m) => m[1]);
  const inlineScripts = [
    ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1]);
  const jqueryRel = scriptSrcs.find((s) => s.includes("/jquery/jquery.js"));
  if (!jqueryRel) throw new Error("jquery script not found");
  const jqueryCode = await fetchText(new URL(jqueryRel, PAGE_URL).href);

  const dom = new JSDOM(html, {
    url: PAGE_URL,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w.navigator, "userAgent", {
    value: UA,
    configurable: true,
  });
  w.crypto = webcrypto;
  w.alert = () => {};
  w.ModalLayer = { msg() {}, close() {} };
  w.location.reload = () => {};
  w.atob = (s) => Buffer.from(String(s || ""), "base64").toString("binary");
  w.btoa = (s) => Buffer.from(String(s || ""), "binary").toString("base64");
  if (options.cookie) {
    for (const pair of String(options.cookie).split(";")) {
      const x = pair.trim();
      if (!x || !x.includes("=")) continue;
      try {
        w.document.cookie = x;
      } catch (_) {}
    }
  }
  w.eval(jqueryCode);

  let captchaResult = options.captchaResult || "";
  if (!captchaResult && options.gif) {
    try {
      captchaResult = fs.readFileSync(path.resolve(options.gif)).toString("base64");
    } catch (_) {}
  }
  if (!captchaResult) captchaResult = DUMMY_GIF_BASE64;

  let encoded = "";
  w.$.ajax = (opts) => {
    if ((opts.url || "").includes("1_captcha_check")) {
      if (opts.data && typeof opts.data.text === "string") encoded = opts.data.text;
      if (typeof opts.success === "function") opts.success({ success: false, msg: "failed" });
      return { abort() {} };
    }
    if (typeof opts.success === "function") {
      if ((opts.url || "").includes("/api/user")) opts.success({ status: 0 });
      else if ((opts.url || "").includes("/match2025/logo")) opts.success(options.logo || String(Date.now()));
      else if ((opts.url || "").includes("1_captcha_jpg")) {
        if (options.forceA && opts.data && typeof opts.data === "object") {
          opts.data.a = options.forceA;
        }
        opts.success({ result: captchaResult });
      }
      else opts.success({});
    }
    return { abort() {} };
  };

  for (const code of inlineScripts) {
    if (!code || !code.trim()) continue;
    try {
      w.eval(code);
    } catch (_) {}
  }

  if (typeof w.text_oninput !== "function") throw new Error("text_oninput missing");
  try {
    w.text_oninput({ value: String(value || "") });
  } catch (_) {}
  if (!encoded) throw new Error("encode text failed");
  return encoded;
}

async function main() {
  const cmd = process.argv[2] || "";
  if (cmd === "param-a") {
    const a = await buildParamA();
    process.stdout.write(JSON.stringify({ ok: true, a }));
    return;
  }
  if (cmd === "longest-png") {
    const args = parseArgs(process.argv);
    if (!args.gif) throw new Error("missing --gif");
    const r = extractLongestPng(args.gif, args.outPng);
    process.stdout.write(JSON.stringify({ ok: true, ...r }));
    return;
  }
  if (cmd === "encode-text") {
    const args = parseArgs(process.argv);
    if (!args.value) throw new Error("missing --value");
    const text = await encodeCheckText(args.value, args);
    process.stdout.write(JSON.stringify({ ok: true, text }));
    return;
  }
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error:
        "usage: node yrx_topic1_bridge.js param-a | longest-png --gif <path> [--out-png <path>] | encode-text --value <abcd>",
    })
  );
  process.exitCode = 2;
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  process.exitCode = 1;
});
