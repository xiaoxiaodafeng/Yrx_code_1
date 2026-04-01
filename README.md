# 猿人学第三届验证码第一题

猿人学第三届验证码第一题AI 自动化逆向。

## 文件
1. `run_topic1_with_bridge.py`：Python 主流程
2. `yrx_topic1_bridge.js`：JS 桥接（`a` / `text` / 最长帧提取）

## 完整流程
1. `node yrx_topic1_bridge.js param-a` 生成动态参数 `a`
2. Python 请求 `POST /match2025/topic/1_captcha_jpg` 获取 GIF
3. `node yrx_topic1_bridge.js longest-png` 提取停留最长帧
4. Python OCR 识别验证码候选
5. `node yrx_topic1_bridge.js encode-text --value <code>` 生成加密 `text`
6. Python 请求 `POST /match2025/topic/1_captcha_check` 提交 `text`

## 逆向具体逻辑

1. 页面中真实发包链路是：
   - 先 `POST /match2025/topic/1_captcha_jpg`，表单字段只有 `a`
   - 再 `POST /match2025/topic/1_captcha_check`，表单字段只有 `text`

2. `a` 不是固定值，也不是简单时间戳：
   - 在 `yrx_topic1_bridge.js` 里用 `jsdom` 执行页面内联脚本
   - 通过拦截 `$.ajax` 捕获页面准备发送到 `1_captcha_jpg` 的 `data.a`
   - `param-a` 子命令返回该值

3. `1_captcha_jpg` 返回 JSON：
   - `{"result":"<base64 gif>"}`
   - Python 端先宽松解码 base64，再保存为 `runs/topic1_captcha.gif`

4. “停留最长帧”提取方式：
   - `yrx_topic1_bridge.js longest-png` 使用 `gifuct-js` 解帧
   - 按每帧 `delay` 选最大值对应帧
   - 导出 PNG（`runs/topic1_longest_frame.png`）

5. `text` 生成不是明文提交：
   - 真实页面是调用 `text_oninput` 后内部编码，再发 `text`
   - `encode-text` 子命令同样执行页面 JS，并调用 `text_oninput({value: code})`
   - 在拦截到的 `1_captcha_check` 请求里读取 `data.text`
   - Python 端提交该加密后的 `text`

6. 为什么识别对了也可能 `failed`：
   - OCR 存在 1 字符误判（干扰线导致 `m/n`, `u/v`, `g/9` 常见）
   - 会话上下文不一致（cookie/session 变更）
   - `text` 必须由页面同款逻辑生成，明文提交会稳定失败

7. 当前实现中的对应入口：
   - `run_topic1_with_bridge.py`：
     - `safe_post/safe_get` 请求封装
     - `ocr_candidates` 候选识别
     - 主流程中串联 `param-a -> captcha_jpg -> longest-png -> encode-text -> captcha_check`
   - `yrx_topic1_bridge.js`：
     - `buildParamA()` 生成 `a`
     - `extractLongestPng()` 提取最长帧
     - `encodeCheckText()` 生成加密 `text`

## 运行
```bash
python .\run_topic1_with_bridge.py
```

如果你已人工识别出验证码，直接校验一次：
```bash
python .\run_topic1_with_bridge.py --code 9mmc
```
