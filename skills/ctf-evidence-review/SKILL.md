---
name: ctf-evidence-review
description: 核对 CTF 结论的来源、日志时间线、流量重组和平台判定。
license: MIT
---

# 证据核对

每个结论注明来源文件、位置、提取命令和当前状态：直接观察、推断、被反驳或未确定。题解中的答案和平台 accepted 不能代替每个字段的证据。候选连续三次被拒绝时，重新检查格式、语义、来源与附件版本。

## 流量与日志

- 流量按连接重组，检查丢包、重传和时间范围。字符串可能跨包；逐包搜索不能排除重组后的内容。TLS 密文需要相应密钥或端点记录。
- Windows XML 日志保留时区、RecordID、EventID、Provider 和命名字段。使用带时区的时间戳排序，区分命中次数、去重记录和配对事件。
- 配对规则是分析约定。未配对的停止事件不证明服务持续停止，缺少恢复记录也不能超出日志覆盖范围解释。
- 字符串检查保留编码、字节位置和变换方式。诱饵指标需要执行或时序证据支持，不能只按名称选择答案。

按 ctf-workbench 设置 Python、技能和 TShark 路径后：

```powershell
& $ctfPython -X utf8 (Join-Path $ctfSkills 'ctf-evidence-review/scripts/event_timeline.py') './original/events.xml' --output './work/events.json'
& $ctfTshark -r './original/capture.pcap' -q -z follow,tcp,ascii,0
```

`event_timeline.py` 读取 XML，不直接解析二进制 EVTX。缺失字段保留为空。tcpflow 遇到不支持的链路类型时使用能识别该封装的解析器，不能将解析失败记为没有数据。

## 复核与交付

题解和附件冲突时，保留版本、哈希、原句、检索范围与复现输出。先检查编码、重组和统计口径；部署差异等原因需要额外材料。

交接材料包含附件哈希、已验证结论、失败假设、命令、依赖和下一项实验。外部协作及上传附件须有用户授权，材料中不包含口令、Cookie 或代理密钥。赛后源码对照应标明来源，不能据此声称已独立解题或证明比赛实例的部署状态。
