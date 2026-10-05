# Third-party notices

## CTF reference material

The guides and reference files in `ctf-web`, `ctf-crypto`, `ctf-reverse`, `ctf-pwn`, `ctf-forensics`, `ctf-misc` and `ctf-writeup` use material from [ljagiello/ctf-skills](https://github.com/ljagiello/ctf-skills/tree/c332c7be1b27cb64639a20124ac55ba916adef92), revision `c332c7be1b27cb64639a20124ac55ba916adef92`.

Copyright (c) 2026 Lukasz Jagiello. MIT license. The notice is retained in each topic's LICENSE and in [LICENSES/ctf-skills-MIT.txt](LICENSES/ctf-skills-MIT.txt). Skill entries and guide navigation are adapted for DSH. Source locations, upstream hashes and distributed guide hashes are recorded in [sources.json](sources.json). Attributions in the reference files apply to their respective examples.

## DeepSeek Harness

The mode composition uses the standard preset and plugin APIs from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/639ed015397290b3745d163aafe02ffee4aa3f84), version 0.2.0-rc.2.

Copyright (c) 2026 DeepSeek. MIT license. See [LICENSES/deepseek-harness-MIT.txt](LICENSES/deepseek-harness-MIT.txt).

## Playwright MCP

[@playwright/mcp](https://github.com/microsoft/playwright-mcp), version 0.0.82, is an Apache-2.0 dependency. npm installs its license and those of its dependencies. See the project's [LICENSE](https://github.com/microsoft/playwright-mcp/blob/main/LICENSE). Browser binaries are installed separately and retain their upstream notices.

## External tools

The Python packages in requirements.txt and tools linked from the skills are installed separately and retain their own licenses. This repository does not distribute their binaries.

| Purpose | Direct upstream projects |
|---|---|
| Audio/scientific | [NumPy](https://numpy.org/), [SciPy](https://scipy.org/), [Matplotlib](https://matplotlib.org/), [SoundFile](https://github.com/bastibe/python-soundfile), [FFmpeg](https://ffmpeg.org/), [SoX](https://sox.sourceforge.net/) |
| Crypto/constraints | [PyCryptodome](https://www.pycryptodome.org/), [SymPy](https://www.sympy.org/), [Z3](https://github.com/Z3Prover/z3), [SageMath](https://www.sagemath.org/), [fpylll](https://github.com/fplll/fpylll) |
| HTTP | [Requests](https://requests.readthedocs.io/), [HTTPX](https://www.python-httpx.org/), [Beautiful Soup](https://www.crummy.com/software/BeautifulSoup/), [PyJWT](https://github.com/jpadilla/pyjwt), [Flask](https://flask.palletsprojects.com/) |
| Binary analysis | [pyelftools](https://github.com/eliben/pyelftools), [pefile](https://github.com/erocarrera/pefile), [LIEF](https://lief.re/), [Capstone](https://www.capstone-engine.org/), [Unicorn](https://www.unicorn-engine.org/), [ROPgadget](https://github.com/JonathanSalwan/ROPgadget), [radare2](https://github.com/radareorg/radare2), [pwntools](https://github.com/Gallopsled/pwntools), [Pwndbg](https://github.com/pwndbg/pwndbg), [GDB](https://www.gnu.org/software/gdb/) |
| Forensics/formats | [dpkt](https://github.com/kbandla/dpkt), [Scapy](https://scapy.net/), [Pillow](https://python-pillow.org/), [py7zr](https://github.com/miurahr/py7zr), [yara-python](https://github.com/VirusTotal/yara-python), [PyYAML](https://pyyaml.org/), [Wireshark/TShark](https://www.wireshark.org/), [tcpflow](https://github.com/simsong/tcpflow) |
