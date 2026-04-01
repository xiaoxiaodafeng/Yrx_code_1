# Yrx_code_1

猿人学第三届验证码第一题（Topic1）AI 自动化逆向最小实现。

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

## 运行
```bash
python .\run_topic1_with_bridge.py
```

如果你已人工识别出验证码，直接校验一次：
```bash
python .\run_topic1_with_bridge.py --code 9mmc
```
