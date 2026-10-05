---
name: ctf-audio-signals
description: 音频 CTF 的声道、元数据、频谱、倒放和隐写分析。
license: MIT
---

# 音频与信号

使用 ctf-workbench 配置的 Python、NumPy、SciPy、Matplotlib、SoundFile，以及按需安装的 FFmpeg/SoX。保留原件，记录哈希、采样率、位深、声道和时长。

## 分析步骤

1. 分别检查元数据、原始声道、左右差分与和、正放与倒放、非语音区间、频谱、低位及文件尾。先保留多声道结构，再决定是否混音。
2. 用 audio_probe.py 生成概要和频谱图，实际打开图像检查。对异常区间按原始时间坐标放大。
3. 选择能区分脉冲与载波的窗长。2048 点 FFT 在 44.1 kHz 下约覆盖 46 ms，可能混合较短脉冲。先测频率、间距和同步关系，再解释为 FSK、摩斯码或点阵。
4. 每段解码记录声道、时间窗、参数、输出和校验。ASR、OCR 和看过答案后的猜读需要原始信号支持。
5. 检查重采样的单位与时长。播放采样率不变时，样本数减为四分之一会加速四倍。降采样可能滤掉高频载体。

按 ctf-workbench 设置路径后：

```powershell
& $ctfPython -X utf8 (Join-Path $ctfSkills 'ctf-audio-signals/scripts/audio_probe.py') './original/audio.wav' --out './work/audio'
& $ctfPython -X utf8 (Join-Path $ctfSkills 'ctf-audio-signals/scripts/audio_probe.py') './original/audio.wav' --out './work/zoom' --start 2 --end 4 --max-hz 5000
```

脚本生成分析数据与图像，不自动转写或解码。非 WAV 标签可用 ffprobe 补充。未恢复的片段明确保留，不用公开答案补齐后当作提取结果。
