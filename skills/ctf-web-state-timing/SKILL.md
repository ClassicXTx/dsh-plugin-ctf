---
name: ctf-web-state-timing
description: CTF Web 的 Cookie、认证状态、多阶段 token 和响应时间实验。
license: MIT
---

# 会话与计时

在明确的题目目标内使用 requests/httpx 和浏览器。每个逻辑身份维护独立会话，记录请求方法、路径、状态码、重定向、Cookie 名称、身份字段及下一入口。敏感值保存在题目私有文件中。

## 状态

服务端时间与产生它的 Cookie、后端、UA 和阶段配对。保留时区，核对 Date 与正文时间字段的用途。认证前后可能采用不同身份或 token 算法；阶段变化后重新检查。相对 URL 按实际接口前缀拼接，注意尾斜杠。

候选连续三次失败时检查会话、时间、编码、后端轮换和错误响应，再改变公式。连接失败、排队和限流不能直接作为漏洞信号。

## 测量

1. 明确计时范围：首字节、响应头或完整正文。先确认目标可达且返回预期应用。
2. 单并发预热，随机候选顺序，穿插阴性对照。保存原始样本、状态和超时，用成对差值、中位数与 MAD 复测候选。
3. 在本地检查有信号和零信号对照，并采用与目标相近的延迟量级。遇到 429、相同超时或明显噪声时暂停并降速。
4. 客户端时延不能单独确定服务端原因。需要解释源码与测量差异时，读取 [运行环境归因](references/runtime-attribution.md)。

`timing_probe.py` 对显式 URL 校准一个位置，不循环提取完整答案。按 ctf-workbench 设置路径后：

```powershell
& $ctfPython -X utf8 (Join-Path $ctfSkills 'ctf-web-state-timing/scripts/timing_probe.py') 'http://127.0.0.1:5000/check' --prefix 'demo{' --alphabet 'abc' --control '!' --rounds 9 --out './work/calibration.json' --no-env-proxy
```

`--no-env-proxy` 仅适用于无需环境代理的本地校准。远端按实际网络配置访问。请求头可从私有 JSON 读取，报告不包含敏感值。依赖含有题目代码时先静态检查，并使用独立实验环境。
