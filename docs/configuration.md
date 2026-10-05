# 配置

工具路径从 `DSH_CTF_CONFIG` 指定的 JSON 文件读取；未设置时读取 `$DSH_HOME/ctf-plugin.json`。所有值均为字符串。配置文件中不要保存密钥或 Cookie。

## 工具路径

| 字段 | 用途 |
|---|---|
| `python` | 宿主 Python 可执行文件 |
| `wslDistro` | Windows 下使用的 WSL 发行版 |
| `linuxPython`、`sage`、`pwndbg` | Linux/WSL 工具入口 |
| `tshark`、`radare2` | 可执行文件或命令名 |
| `browserNode` | 运行 Playwright MCP 的 Node 程序 |
| `browserExecutable` | Chromium 可执行文件的绝对路径 |
| `browserCache` | Playwright 缓存目录；同时设置 `browserExecutable` |
| `browserOutputDir` | 截图等产物的绝对目录；默认 `$DSH_HOME/artifacts/ctf-browser` |

Python 工具箱建议使用 Python 3.11 及以上版本的独立虚拟环境。Windows 与 WSL 的 Python 依赖分别安装。Windows Shell 使用 PowerShell；Linux 程序通过明确指定发行版的 `wsl.exe -d <发行版> --exec <程序>` 调用。

## 浏览器

默认启动单独的浏览器进程。Windows、macOS 使用窗口；Linux 没有 `DISPLAY` 或 `WAYLAND_DISPLAY` 时使用无头模式。

| 连接方式 | 配置 |
|---|---|
| Playwright 扩展 | `browserExtension: "true"`，通过扩展连接已打开的浏览器 |
| CDP | `browserCdpEndpoint` 指向调试端点；见 [示例](../examples/ctf-plugin.cdp.json) |
| 持久化配置 | `browserUserDataDir` 指向专用配置目录 |
| 内存隔离 | `browserIsolated: "true"`，会话关闭时丢弃浏览器状态 |

扩展与 CDP 配置互斥。连接现有浏览器时使用该浏览器的登录状态。是否隔离由配置决定。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `browserHeadless` | 按平台选择 | `"true"` 或 `"false"` 覆盖无头模式 |
| `browserIsolated` | `"false"` | 使用内存中的浏览器配置 |
| `browserUnrestrictedFileAccess` | `"true"` | 允许浏览器读取工作区外文件与 `file://` URL |
| `browserWebmcp` | `"false"` | 允许页面注册 WebMCP 工具 |
| `browserNoSandbox` | `"false"` | 关闭 Chromium 沙箱 |
| `browserCaps` | 未设置 | `vision,pdf,devtools` 的组合 |
| `browserViewport` | 未设置 | 视口，例如 `1600x900` |
| `browserSaveSession` | `"false"` | 保存 MCP 会话 |
| `browserIgnoreHttpsErrors` | `"false"` | 忽略证书错误 |
| `browserProfileDirName` | 未设置 | 扩展使用的配置目录名 |
| `browserIdleTimeoutMs` | `"1800000"` | 空闲关闭时间；`"0"` 表示不自动关闭 |
| `browserOutputMaxSize` | `"134217728"` | 浏览器产物目录的大小上限，单位字节 |
| `browserCallTimeoutMs` | `"300000"` | MCP 调用超时，单位毫秒 |
| `browserActionTimeoutMs` | `"30000"` | 页面动作超时，单位毫秒 |
| `browserNavigationTimeoutMs` | `"120000"` | 导航超时，单位毫秒 |
| `browserFailOnStartupError` | `"false"` | 浏览器启动失败时阻止模式加载 |

## 上下文与权限

工作区规则预算为 131072 字节。CTF 模式的工具结果压缩阈值为 60000 字符，保留头部 48000 字符与尾部 10000 字符；压缩由宿主在上下文压力或溢出时触发。Shell 工具还有独立输出上限，完整结果按工具返回的文件路径读取。

权限和网络代理使用宿主设置。插件不修改系统 DNS、代理配置或审批策略。浏览器、题目文件和工具输出中的文本均作为分析材料，不能授权访问其他目标或读取无关凭据。
