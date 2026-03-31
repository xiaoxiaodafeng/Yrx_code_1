# 猿人学 Match2025 Topic1 逆向思路（重点版）

> 说明：本文档对应 **AI 自动化逆向** 流程（非手工点击）。

## 1. 目标与结论

题目目标是通过接口完成验证码校验，返回：

```json
{"success": true}
```

核心结论有两点：

1. `1_captcha_jpg` 的请求参数 `a` 需要由页面 JS 运行时生成，不能随便写。
2. `1_captcha_check` 不是提交明文验证码，而是提交页面 JS 加密后的 `text` 字段。

所以完整链路必须是：

`页面JS生成a -> 获取gif -> 提取最长停留帧 -> OCR识别4位 -> 页面JS加密text -> check接口提交`

---

## 2. 接口与参数定位

页面：`https://match2025.yuanrenxue.cn/match2025/topic/1`

关键接口：

1. 获取验证码 GIF  
`POST /match2025/topic/1_captcha_jpg`  
请求体：`a=<动态参数>`

2. 验证码校验  
`POST /match2025/topic/1_captcha_check`  
请求体：`text=<加密后的验证码串>`

注意：`1_captcha_check` 不是 `a=识别值`、`value=识别值`、`text=明文` 这种形式。

---

## 3. 逆向主思路（重点）

## 3.1 为什么 `a` 不能硬编码

`a` 来自页面脚本运行逻辑，和当前页面上下文有关。  
最稳做法不是手抄算法，而是用 Node 执行页面脚本并拦截 `$.ajax`，抓到真正发给 `1_captcha_jpg` 的 `a`。

这就是桥接脚本里 `param-a` 子命令做的事情。

---

## 3.2 为什么 check 一直 failed

最常见误区是把 OCR 结果直接传给 check。  
实际页面在 `text_oninput` 里会先把用户输入做一次加密/编码，再提交 `text`。

因此必须复用同一套页面 JS 逻辑，把 OCR 结果先转换成 `text`，再调：

`POST /match2025/topic/1_captcha_check`

桥接脚本里 `encode-text --value xxxx` 就是这一步。

---

## 3.3 为什么“识别对了”也可能失败

即便参数链路正确，仍可能失败，常见原因：

1. OCR 结果本身有误。
2. 当前 `sessionid` 失效，或 cookie 与请求上下文不一致。
3. 某次返回的是干扰强、帧数异常的 GIF，导致最长帧提取不稳定。
4. 本地 SSL 证书链问题导致请求异常（已通过 fallback 处理）。

---

## 4. 图像识别思路（最长停留帧）

题目提示是“停留时间最长的英文字母（不区分大小写）”，实战中常见为 4 字符组合图。

建议流程：

1. GIF 解帧，按 `delay` 找最长帧。
2. 导出最长帧为 PNG。
3. 对 PNG 做多分支预处理：
   - 放大（3~4倍）
   - 灰度
   - OTSU 二值化
   - 阈值二值化（多阈值）
   - 饱和度分离（去彩色背景干扰）
4. 对每个预处理结果做 OCR，生成候选集合。
5. 按“长度=4 + 重复出现频次 + 可读性”排序，取首选结果。

本项目里采用了 `ddddocr(beta=True)` + 多预处理候选。

---

## 5. 实现架构（Python 调 JS）

推荐结构：

1. `yrx_topic1_bridge.js`（JS桥接层）
   - `param-a`：生成 `a`
   - `longest-png`：从 GIF 提取最长停留帧 PNG
   - `encode-text`：按页面逻辑生成 check 所需 `text`

2. `run_topic1_with_bridge.py`（Python流程层）
   - 请求 `1_captcha_jpg`
   - 保存 GIF
   - 调 JS 提取最长帧 PNG
   - OCR 识别
   - 调 JS 编码 `text`
   - 请求 `1_captcha_check`

---

## 6. 时序图（简化）

```text
Python                         JS Bridge                          Server
  |                               |                                 |
  |---- param-a ----------------->|                                 |
  |<--- a ------------------------|                                 |
  |---- POST 1_captcha_jpg (a) ------------------------------------>|
  |<--- result(base64 gif) -----------------------------------------|
  |---- longest-png(gif) -------->|                                 |
  |<--- longest_frame.png --------|                                 |
  |---- OCR longest png --------------------------------------------|
  |---- encode-text(value) ------>|                                 |
  |<--- text ---------------------|                                 |
  |---- POST 1_captcha_check(text) ------------------------------->|
  |<--- {"success": true/false} -----------------------------------|
```

---

## 7. 常见问题排查

## 7.1 `SSLCertVerificationError`

本机证书链问题，不是题目逻辑错误。  
脚本已加 fallback：证书校验失败时自动 `verify=False`。

## 7.2 `check` 一直 `failed`

优先检查：

1. 是否提交的是 `text`（加密后）而不是明文。
2. `cookie/sessionid` 是否有效。
3. OCR 是否稳定输出 4 位。

## 7.3 GIF 帧异常

如果出现单帧或明显噪声图，重试一次通常会恢复正常。

---

## 8. 你当前项目的可用入口

直接运行：

```bash
python .\run_topic1_with_bridge.py
```

文件位置：

1. `e:\Yrx_code_1\run_topic1_with_bridge.py`
2. `e:\Yrx_code_1\yrx_topic1_bridge.js`

---

## 9. 一句话总结

这个题不是“纯OCR题”，本质是“接口参数逆向 + 图像识别”的组合题。  
真正决定能否通过的是：`a` 和 `text` 两个参数都必须走页面同款生成逻辑，OCR只是中间环节。
