# 猿人学第三届验证码第一题：完整流程（AI自动化逆向）

## 1. 全流程概览

1. `yrx_topic1_bridge.js param-a` 生成动态参数 `a`
2. Python 请求 `POST /match2025/topic/1_captcha_jpg` 获取 GIF
3. `yrx_topic1_bridge.js longest-png` 提取停留最长帧 PNG
4. Python OCR 识别 4 位验证码候选
5. `yrx_topic1_bridge.js encode-text` 生成加密后的 `text`
6. Python 请求 `POST /match2025/topic/1_captcha_check` 提交 `text`

---

## 2. 为什么经常 `{"success": false}`

最常见不是“请求没发出去”，而是以下几类问题：

1. OCR 识别值不准确  
视觉上看对，但字符可能被干扰线影响（如 `v/u`, `m/n`, `g/9`）。

2. 编码上下文不一致  
`text` 编码过程要和当前会话一致（cookie、logo、同次验证码上下文）。

3. 会话过期  
`sessionid` 过期后所有 check 都会失败。

4. 本地 TLS 证书链问题  
会引发请求异常（脚本已内置 fallback）。

---

## 3. 当前代码已做的关键保障

`run_topic1_with_bridge.py` 已支持：

1. 自动处理 TLS 证书异常（失败回退 `verify=False`）
2. 请求 `logo` 并参与编码上下文
3. 把同次验证码 GIF 传给 `encode-text`
4. 把同次 `a` 通过 `--force-a` 传给编码逻辑
5. 把同一份 cookie 注入到 jsdom 的 `document.cookie`
6. 支持 `--code xxxx` 手工指定识别结果直接校验

---

## 4. 推荐调试方式

## 4.1 自动模式

```bash
python .\run_topic1_with_bridge.py
```

看输出：

1. `[4] candidates: [...]`
2. `[5] encrypted text: ...`
3. `[6] try xxxx -> {"success": ...}`

## 4.2 手工识别模式

你人工看图后直接提交：

```bash
python .\run_topic1_with_bridge.py --code mnmv
```

如果手工也持续失败，优先怀疑：

1. 当前会话已经变更/失效
2. 输入并非实际验证码（视觉误判）

---

## 5. 结论

这个题的本质是“参数逆向 + 图像识别 + 会话一致性”。  
`text` 加密正确只是必要条件，不是充分条件；验证码本体识别偏差是失败主因。
