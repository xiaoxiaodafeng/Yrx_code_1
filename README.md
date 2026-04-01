# Yrx_code_1

猿人学第三届验证码第一题（Topic1）最小可用实现。  
本项目为 **AI 自动化逆向** 实现（参数逆向 + 图像识别 + 协议校验）。

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

`1_captcha_check` 返回 `{"success": true}` 即通过。

## 关键点

1. `a` 不能写死，必须走页面同款生成逻辑。
2. check 提交的是加密 `text`，不是明文验证码。
3. OCR 结果看起来正确也可能误判，干扰线会影响 1~2 字符。
4. 会话必须一致（cookie/session）。
5. 本地证书链异常时脚本会回退 `verify=False`。

## 运行

```bash
python .\run_topic1_with_bridge.py
```

若已人工识别验证码，可直接提交一次：

```bash
python .\run_topic1_with_bridge.py --code 9mmc
```
