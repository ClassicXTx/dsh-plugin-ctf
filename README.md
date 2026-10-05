# dsh-plugin-ctf

DeepSeek Harness 的 CTF 模式，包含 Web、密码学、逆向、Pwn、取证和杂项技能。

支持 **DeepSeek Harness 0.2.0-rc.2**。选择新会话中的 **CTF 竞赛** 使用。

## 安装

在 DSH 插件管理器中输入：

```text
https://github.com/ClassicXTx/dsh-plugin-ctf
```

Web CLI：

```sh
dsh plugin --profile web add github:ClassicXTx/dsh-plugin-ctf#v1.2.0
```

Desktop 先启动一次以创建 profile，然后退出应用，使用 Desktop 自带的 CLI 安装。Windows 默认路径：

```powershell
$desktopDsh = Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'
& $desktopDsh plugin --profile desktop add 'github:ClassicXTx/dsh-plugin-ctf#v1.2.0'
```

安装后重新打开 DSH。插件通过 `dsh-plugin` 主题列入 [社区插件目录](https://github.com/topics/dsh-plugin)。

## 技能

| 技能 | 用途 |
|---|---|
| `ctf-workbench` | 题目建档、附件检查、工具选择 |
| `ctf-web` | Web 漏洞与协议分析 |
| `ctf-crypto` | 密码算法、数论与约束求解 |
| `ctf-reverse` | 静态分析、动态调试与仿真 |
| `ctf-pwn` | 二进制漏洞与利用 |
| `ctf-forensics` | 流量、日志、文件与隐写 |
| `ctf-misc` | 编码、受限环境和其他杂项 |
| `ctf-writeup` | 解题过程与复现说明 |
| `ctf-evidence-review` | 证据核对、日志时间线 |
| `ctf-audio-signals` | 声道、频谱和音频隐写 |
| `ctf-web-state-timing` | 会话状态和计时实验 |

技能随 CTF 模式加载。专题入口对应相邻的 `guide.md` 和参考文件，包含算法、命令与示例。

开始时给出题面、附件位置、目标范围和 flag 格式。原始附件、分析产物和解题脚本分别保存在题目目录中。

## 工具

提供 4 个 Python 分析脚本和 Playwright MCP 浏览器接口。Python 工具箱、WSL、Sage、Pwndbg、radare2、TShark 等按题目需要另行安装。

```sh
python -m venv .venv
# Linux/macOS
.venv/bin/python -m pip install -r requirements.txt
# Windows
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

在插件目录运行 `npm run install:browser` 下载 Chromium，或配置已有的浏览器。运行 `npm run doctor` 检查工具入口。

复制 [配置示例](examples/ctf-plugin.json) 到 `$DSH_HOME/ctf-plugin.json` 并填写实际路径。也可用 `DSH_CTF_CONFIG` 指定配置文件。浏览器连接方式、参数和输出上限见 [配置说明](docs/configuration.md)。

## 开源来源

7 个专题的参考资料来自 [ljagiello/ctf-skills](https://github.com/ljagiello/ctf-skills/tree/c332c7be1b27cb64639a20124ac55ba916adef92)，采用 MIT 许可证。模式配置使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件接口；浏览器依赖 [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)。

许可证和署名见 [第三方说明](THIRD_PARTY_NOTICES.md)，来源版本及文件校验值见 [sources.json](sources.json)。

## 测试

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
python -X utf8 tests/check_helpers.py --out work/helper-checks
```

测试使用合成附件、本地网页和模拟模型。DSH 会话恢复与浏览器重连检查见 [测试说明](tests/README.md)。
