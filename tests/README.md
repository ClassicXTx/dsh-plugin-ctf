# Tests

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
python -X utf8 tests/check_helpers.py --out work/helpers
python -X utf8 tests/check_patch_structure.py cordis.patch.yml
```

The runtime tests cover configuration, browser arguments, skill files and source hashes. The Python checks use synthetic audio, XML and timing controls. On Windows, `--wsl-distro Ubuntu` adds FFmpeg, SoX and offline TCP reassembly checks.

## DSH integration

Requires Windows, a built DeepSeek Harness 0.2.0-rc.2 checkout, and the Python toolbox. Set `DSH_CTF_PYTHON` to the Python executable and `DSH_CTF_CONFIG` to a tool-path JSON file, then run:

```text
node tests/dsh-smoke.cjs <dsh-source-root> <report-directory>
```

The test uses an isolated DSH_HOME, a local model fixture and a localhost webpage. It checks skill isolation, tool calls, session recovery and MCP reconnection, and stops its own processes. It does not call paid models or competition targets. Native Linux/macOS integration and Desktop UI behavior require separate checks.
