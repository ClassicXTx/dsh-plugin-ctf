---
name: ctf-web
description: Web 漏洞、认证、请求与响应、应用源码。
license: MIT
compatibility: DeepSeek Harness 0.2.0-rc.2
metadata:
  user-invocable: "false"
---

# CTF Web

先加载 ctf-workbench，确认题目范围和已配置工具。整理入口、参数、Cookie 和权限边界；复现正常请求，再测试能区分假设的输入。保存原始请求与响应，按漏洞条件选择验证方法。

## 参考

- [专题参考](guide.md)

按当前问题读取相关章节。参考中的依赖和安装命令按需使用，运行前核对占位符、目标、版本与并发设置。

来源：[ljagiello/ctf-skills](https://github.com/ljagiello/ctf-skills/blob/c332c7be1b27cb64639a20124ac55ba916adef92/ctf-web/SKILL.md)，MIT。许可证见 [LICENSE](LICENSE)。
