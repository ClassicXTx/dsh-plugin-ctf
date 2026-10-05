---
name: ctf-pwn
description: 内存破坏、堆利用、格式化字符串和二进制漏洞。
license: MIT
compatibility: DeepSeek Harness 0.2.0-rc.2
metadata:
  user-invocable: "false"
---

# CTF Pwn

先加载 ctf-workbench，确认题目范围和已配置工具。核对架构、保护机制、加载器和库版本；建立本地复现，区分偏移、泄漏与控制流。按题目协议调试利用脚本，保留失败样本。

## 参考

- [专题参考](guide.md)
- [overflow-basics.md](overflow-basics.md)
- [rop-and-shellcode.md](rop-and-shellcode.md)

按当前问题读取相关章节。参考中的依赖和安装命令按需使用，运行前核对占位符、目标、版本与并发设置。

来源：[ljagiello/ctf-skills](https://github.com/ljagiello/ctf-skills/blob/c332c7be1b27cb64639a20124ac55ba916adef92/ctf-pwn/SKILL.md)，MIT。许可证见 [LICENSE](LICENSE)。
