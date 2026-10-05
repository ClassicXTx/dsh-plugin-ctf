# Linux and WSL tools

For Linux ELF/Pwn debugging, SageMath and native analysis, read the CTF persona's wslDistro, linuxPython, sage and pwndbg settings. Check executables before use. Installing this plugin does not install these tools; each virtual environment, Sage environment and Pwndbg runtime is separate.

On Windows use `wsl.exe -d <configured-distro> --exec <configured-executable> <arguments>`. Convert file paths with `wsl.exe -d <configured-distro> --exec wslpath -a -u '<Windows path>'`. Quote paths with spaces and use `--cd '<Linux directory>'` when relative paths matter. On native Linux/macOS invoke the installed executable directly.

Optional tools include pwntools, PyCryptodome, Z3, SymPy, fpylll/cysignals, pyelftools, Capstone, Unicorn, ROPGadget, GCC/GDB/binutils, cross assemblers, patchelf, checksec, strace/ltrace, nasm, gdbserver, binwalk, ExifTool, steghide, 7z, jq, ffuf, sqlmap, FFmpeg/SoX and tcpflow. Install only what the current task needs from its upstream source into suitable environments.

Some existing installations have /opt/dsh-ctf/bin/ctf-python, /opt/dsh-ctf/bin/sage and /opt/dsh-ctf/bin/pwndbg. These are optional local wrappers, not supplied by this package. Configure their actual paths if present; do not infer availability from examples.

Write complex code to .py, .sage, .gdb or LF-encoded .sh files. `sage script.sage` supports preparser syntax; `sage -python script.py` uses Python, where exponentiation is ** and ^ is XOR. GDB/Pwndbg batch checks must verify command output and exit status, not only a banner. `readelf -W -l` avoids wrapped program headers.

Capture $LASTEXITCODE immediately on Windows; use finite timeouts. Verify imports and a known-result experiment in the environment that will perform analysis. WSL can access mounted Windows files; it does not replace a separate sandbox for untrusted samples. Installed tools do not reproduce a challenge's glibc, architecture, kernel or historical container state.
