# 猿人学第三届验证码第一题 技术文档

## 1. 项目目标

实现题目一的协议化验证流程：

1. 获取验证码 GIF（`1_captcha_jpg`）
2. 提取停留时间最长的帧
3. OCR 识别验证码
4. 生成页面同款加密 `text`
5. 提交验证（`1_captcha_check`）

目标响应：

```json
{"success": true}
```

---

## 2. 文件结构

1. `run_topic1_with_bridge.py`  
Python 主流程，负责请求、识别、提交。

2. `yrx_topic1_bridge.js`  
JS 桥接层，负责复用页面 JS 逻辑：
- 生成 `a`（`param-a`）
- 从 GIF 提取最长帧 PNG（`longest-png`）
- 生成 check 加密参数 `text`（`encode-text`）

3. `topic1_reverse_guide.md`  
逆向思路文档（详细版）。

4. `package.json` / `package-lock.json`  
Node 依赖清单。

---

## 3. 核心技术点

## 3.1 参数 `a` 生成

`a` 来自页面 JS 运行时逻辑，不能硬编码。  
通过 `jsdom + 执行内联脚本 + 拦截 $.ajax`，抓到发往 `1_captcha_jpg` 的真实 `a`。

## 3.2 验证参数 `text` 生成

`1_captcha_check` 不是提交明文验证码。  
页面会将输入值编码后，只提交 `text`。  
桥接脚本用同样方式调用 `text_oninput` 捕获真实 `text`。

## 3.3 最长帧识别

GIF 解帧后按 `delay` 选最大帧。  
将该帧导出 PNG，做 OCR（放大+灰度/二值化）提取 4 位结果。

---

## 4. 执行流程

```text
Python -> node bridge param-a -> POST 1_captcha_jpg(a)
       -> 保存 gif
       -> node bridge longest-png(gif)
       -> OCR longest png
       -> node bridge encode-text(value)
       -> POST 1_captcha_check(text)
```

---

## 5. 运行方式

安装依赖（Node + Python）后执行：

```bash
python .\run_topic1_with_bridge.py
```

脚本内已内置请求头与 cookie 示例，可按需替换。

---

## 6. 常见问题

## 6.1 SSL 证书错误

报错：

`SSLCertVerificationError`

处理：
脚本已实现自动回退 `verify=False`，用于本地证书链异常环境。

## 6.2 check 返回 failed

排查顺序：

1. OCR 是否识别正确。
2. `text` 是否通过页面同款逻辑生成。
3. `sessionid` 是否有效。
4. 是否命中异常验证码帧（可重试）。

---

## 7. 安全与边界

本项目仅用于猿人学练习题学习与研究，不用于未授权目标。
