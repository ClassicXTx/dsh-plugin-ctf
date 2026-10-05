"""Bounded randomized paired form-POST calibration; never an automatic flag submitter."""
import argparse
import json
import random
import statistics
import time
from pathlib import Path
from urllib.parse import urlsplit
import requests


def mad(values):
    mid = statistics.median(values)
    return statistics.median(abs(x-mid) for x in values)


def probe(url, prefix, alphabet, control='!', rounds=9, timeout=8, delay=.03, headers=None, trust_env=True, min_gap_ms=3):
    if urlsplit(url).scheme not in ('http', 'https') or urlsplit(url).username:
        raise ValueError('An HTTP(S) URL without embedded credentials is required')
    if not 3 <= rounds <= 31 or not 2 <= len(set(alphabet)) <= 96 or control in alphabet or len(control) != 1:
        raise ValueError('Use 3..31 rounds, 2..96 distinct candidates, and a separate one-character control')
    rng, samples = random.Random(20261001), []
    with requests.Session() as session:
        session.trust_env = trust_env
        session.headers.update(headers or {})
        def measure(value):
            start = time.perf_counter()
            r = session.post(url, data={'flag': value}, timeout=timeout, allow_redirects=False)
            elapsed = (time.perf_counter()-start)*1000
            if r.status_code != 200:
                raise RuntimeError(f'Calibration stopped: HTTP {r.status_code}; inspect instance/auth/rate limit')
            time.sleep(delay)
            return elapsed
        measure(prefix + control)
        for round_id in range(rounds):
            for candidate in rng.sample(sorted(set(alphabet)), len(set(alphabet))):
                pair = [('candidate', prefix+candidate), ('control', prefix+control)]
                rng.shuffle(pair)
                values = {kind: measure(value) for kind, value in pair}
                samples.append({'round': round_id, 'candidate': candidate, 'candidate_ms': values['candidate'],
                                'control_ms': values['control'], 'delta_ms': values['candidate']-values['control']})
    stats = []
    for candidate in sorted(set(alphabet)):
        deltas = [r['delta_ms'] for r in samples if r['candidate'] == candidate]
        stats.append({'candidate': candidate, 'median_delta_ms': statistics.median(deltas), 'mad_ms': mad(deltas),
                      'positive_fraction': sum(x > 0 for x in deltas)/len(deltas)})
    stats.sort(key=lambda x:x['median_delta_ms'], reverse=True)
    gap = stats[0]['median_delta_ms'] - stats[1]['median_delta_ms']
    threshold = max(min_gap_ms, 3*(stats[0]['mad_ms']+stats[1]['mad_ms']))
    strong = gap > threshold and stats[0]['median_delta_ms'] > threshold and stats[0]['positive_fraction'] >= .8
    return {'schema':1, 'samples':samples, 'statistics':stats, 'gap_ms':gap, 'required_gap_ms':threshold,
            'candidate_for_independent_retest':stats[0]['candidate'] if strong else None,
            'verdict':'signal-retest-required' if strong else 'inconclusive', 'accepted':False,
            'measurement':'whole-response perf_counter; single concurrency; randomized paired control'}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('url')
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--alphabet', required=True)
    ap.add_argument('--control', default='!')
    ap.add_argument('--rounds', type=int, default=9)
    ap.add_argument('--timeout', type=float, default=8)
    ap.add_argument('--delay', type=float, default=.03)
    ap.add_argument('--headers-file', type=Path)
    ap.add_argument('--no-env-proxy', action='store_true')
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    hdr = json.loads(args.headers_file.read_text(encoding='utf-8')) if args.headers_file else None
    result = probe(args.url,args.prefix,args.alphabet,args.control,args.rounds,args.timeout,args.delay,hdr,not args.no_env_proxy)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k != 'samples'}))
