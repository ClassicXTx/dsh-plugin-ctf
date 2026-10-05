"""Multi-channel audio evidence overview, RIFF inventory and multi-resolution spectra."""
import argparse
import hashlib
import json
import struct
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def riff_chunks(raw):
    if raw[:4] != b'RIFF' or raw[8:12] != b'WAVE':
        return []
    chunks, pos = [], 12
    while pos + 8 <= len(raw):
        name = raw[pos:pos + 4].decode('ascii', 'replace')
        size = struct.unpack_from('<I', raw, pos + 4)[0]
        end = pos + 8 + size
        row = {'id': name, 'offset': pos, 'size': size, 'within_file': end <= len(raw)}
        if name not in ('data', 'fmt ') and size <= 8192:
            row['raw_hex'] = raw[pos + 8:min(end, len(raw))].hex()
        chunks.append(row)
        if end > len(raw):
            break
        pos = end + size % 2
    return chunks


def analyze(source, out, start=0., end=None, max_hz=None):
    source, out = Path(source), Path(out)
    info = sf.info(source)
    if info.duration > 1800:
        raise ValueError('Use an explicit short working copy for files longer than 30 minutes')
    data, rate = sf.read(source, always_2d=True, dtype='float64')
    if len(data) == 0:
        raise ValueError('Empty audio')
    end = info.duration if end is None else end
    if not 0 <= start < end <= info.duration + 1 / rate:
        raise ValueError('Expected 0 <= start < end <= duration')
    clip = data[int(start * rate):min(len(data), int(end * rate))]
    if len(clip) < 64:
        raise ValueError('Selected interval is too short')
    out.mkdir(parents=True, exist_ok=True)
    report = {'schema': 1, 'path': str(source.resolve()), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'sample_rate': rate, 'channels': info.channels, 'frames': len(data), 'seconds': info.duration,
              'format': info.format, 'subtype': info.subtype, 'interval': [start, end],
              'riff_chunks': riff_chunks(source.read_bytes()), 'channel_summary': [], 'plots': []}
    for ch in range(data.shape[1]):
        x = data[:, ch]
        active = np.flatnonzero(np.abs(x) > max(1e-6, float(np.max(np.abs(x))) * .001))
        report['channel_summary'].append({'channel': ch, 'rms': float(np.sqrt(np.mean(x*x))),
            'peak': float(np.max(np.abs(x))), 'nonzero_samples': int(np.count_nonzero(x)),
            'active_window_minus60db': None if not len(active) else [float(active[0]/rate), float(active[-1]/rate)]})
        for nfft in (512, 2048):
            nfft = min(nfft, len(clip))
            f, t, z = signal.stft(clip[:, ch], rate, nperseg=nfft, noverlap=nfft * 3 // 4, boundary=None)
            keep = f <= (max_hz or rate / 2)
            amp = np.maximum(np.abs(z[keep]), 1e-10)
            db = 20 * np.log10(amp / max(float(amp.max()), 1e-10))
            fig, ax = plt.subplots(figsize=(16, 4), layout='constrained')
            ax.pcolormesh(t + start, f[keep], db, cmap='magma', vmin=-80, vmax=0, shading='auto', rasterized=True)
            ax.set(xlabel='Original time (s)', ylabel='Frequency (Hz)', title=f'Channel {ch} | FFT {nfft} | {nfft/rate*1000:.1f} ms window')
            image = out / f'ch{ch}-fft{nfft}.png'
            fig.savefig(image, dpi=130)
            plt.close(fig)
            report['plots'].append(str(image.resolve()))
    if data.shape[1] == 2:
        report['stereo'] = {'equal_fraction': float(np.mean(data[:,0] == data[:,1])),
                            'difference_rms': float(np.sqrt(np.mean((data[:,0]-data[:,1])**2)))}
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--end', type=float)
    ap.add_argument('--max-hz', type=float)
    args = ap.parse_args()
    result = analyze(args.source, args.out, args.start, args.end, args.max_hz)
    print(json.dumps({k: result[k] for k in ('sha256','sample_rate','channels','seconds','interval','plots')}, ensure_ascii=False))
