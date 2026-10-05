"""Synthetic localhost-only acceptance checks for the installed CTF analysis helpers."""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import logging
from pathlib import Path
import random
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs
import numpy as np
import soundfile as sf
from flask import Flask, jsonify
from scapy.all import Ether, IP, TCP, Raw, wrpcap

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / 'skills'


def module(name, source):
    spec = importlib.util.spec_from_file_location(name, source)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main(out, wsl_distro=None):
    out.mkdir(parents=True, exist_ok=True)
    checks = []
    def check(name, condition, evidence=None):
        checks.append({'name':name, 'passed':bool(condition), 'evidence':evidence})
        if not condition:
            raise AssertionError(name)
    result = {'schema':1,'synthetic_only':True,'competition_requests':0,'checks':checks}
    try:
        packages = ['numpy','scipy','matplotlib','soundfile','scapy','flask','requests']
        result['versions'] = {name:importlib.metadata.version(name) for name in packages}
        check('scientific_dependencies_imported', len(result['versions']) == 7)
        app = Flask('ctf_synthetic_fixture')
        app.add_url_rule('/health',view_func=lambda:jsonify(local_fixture=True))
        check('flask_local_test_client', app.test_client().get('/health').json == {'local_fixture':True})
        audio = module('ctf_audio', SKILLS / 'ctf-audio-signals/scripts/audio_probe.py')
        timeline = module('ctf_timeline', SKILLS / 'ctf-evidence-review/scripts/event_timeline.py')
        timing = module('ctf_timing', SKILLS / 'ctf-web-state-timing/scripts/timing_probe.py')
        rate = 8000
        samples = np.arange(rate)/rate
        sound = np.column_stack([.25*np.sin(2*np.pi*440*samples), np.zeros(rate)])
        wav = out / 'synthetic-stereo.wav'
        sf.write(wav, sound, rate, subtype='PCM_16')
        original_hash = hashlib.sha256(wav.read_bytes()).hexdigest()
        a = audio.analyze(wav, out/'audio', max_hz=2000)
        check('audio_structure', (a['sample_rate'],a['channels'],a['frames'],a['seconds']) == (8000,2,8000,1.))
        check('silent_channel_retained', a['channel_summary'][1]['nonzero_samples'] == 0)
        check('four_spectrum_artifacts', len(a['plots']) == 4 and all(Path(p).stat().st_size > 1000 for p in a['plots']))
        check('audio_original_unchanged', hashlib.sha256(wav.read_bytes()).hexdigest() == original_hash)
        try:
            audio.analyze(wav,out/'bad-audio',start=2,end=3)
            raise AssertionError('invalid interval was accepted')
        except ValueError:
            check('audio_rejects_invalid_interval', True)
        from scipy.signal import resample_poly
        slowed = resample_poly(sound[:,0],4,1)
        check('slowdown_duration_units', len(slowed)/rate == 4.)
        xml = out/'synthetic-events.xml'
        xml.write_text('''<Events><Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Fixture"/><EventID>2</EventID><TimeCreated SystemTime="2026-10-01T00:05:00Z"/></System><EventData><Data Name="state">stopped</Data></EventData></Event><Event><System><EventID>1</EventID><TimeCreated SystemTime="2026-10-01T08:00:00+08:00"/></System><EventData><Data Name="state">running</Data></EventData></Event></Events>''',encoding='utf-8')
        t = timeline.analyze(xml)
        check('xml_timezone_order', [r['event_id'] for r in t['records']] == ['1','2'])
        check('xml_namespace_and_named_data', t['records'][1]['data']['state'] == 'stopped')
        bad_xml = out/'invalid-entity.xml'
        bad_xml.write_text('<!DOCTYPE x [<!ENTITY x "test">]><Events/>',encoding='utf-8')
        try:
            timeline.analyze(bad_xml)
            raise AssertionError('DTD was accepted')
        except ValueError:
            check('xml_rejects_dtd', True)
        (out/'events.json').write_text(json.dumps(t,indent=2),encoding='utf-8')
        rng = random.Random(17)
        class Fixture(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def setup(self):
                super().setup()
                self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            def log_message(self,*args):
                pass
            def do_POST(self):
                data = parse_qs(self.rfile.read(int(self.headers.get('Content-Length','0'))).decode())
                value = data.get('flag',[''])[0]
                time.sleep(rng.random()*.001)
                if self.path == '/signal' and value == 'demo-b':
                    time.sleep(.01)
                body = b'{"local_fixture":true}'
                self.send_response(200)
                self.send_header('Content-Type','application/json')
                self.send_header('Content-Length',str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        server = ThreadingHTTPServer(('127.0.0.1',0),Fixture)
        worker = threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            measured = timing.probe(base+'/signal','demo-','abc',rounds=9,delay=.002,trust_env=False)
            negative = timing.probe(base+'/zero','demo-','abc',rounds=9,delay=.002,trust_env=False)
            (out/'timing-signal.json').write_text(json.dumps(measured,indent=2),encoding='utf-8')
            (out/'timing-zero.json').write_text(json.dumps(negative,indent=2),encoding='utf-8')
            check('ten_millisecond_signal', measured['candidate_for_independent_retest'] == 'b', measured['statistics'])
            check('zero_signal_is_inconclusive', negative['candidate_for_independent_retest'] is None, negative['verdict'])
            check('calibration_never_claims_accepted', measured['accepted'] is False and negative['accepted'] is False)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(3)
        if wsl_distro:
            for tool in ('ffmpeg','sox','tcpflow'):
                version_flag = '-version' if tool == 'ffmpeg' else '--version' if tool == 'sox' else '-V'
                proc = subprocess.run(['wsl.exe','-d',wsl_distro,'--exec',tool,version_flag],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
                version = (proc.stdout+proc.stderr).splitlines()[0]
                if tool == 'tcpflow':
                    # tcpflow 1.6.1's -V prints its version but exits 1. Validate
                    # functionality with the actual offline reassembly below.
                    result['tcpflow_version_probe'] = {'text':version,'exit_code':proc.returncode}
                else:
                    check('wsl_'+tool, proc.returncode == 0, version)
            marker = b'CTF_TOOLCHAIN_LOCAL_MARKER'
            packets = [IP(src='192.0.2.1',dst='192.0.2.2')/TCP(sport=40000,dport=80,flags='S',seq=99),
                       IP(src='192.0.2.1',dst='192.0.2.2')/TCP(sport=40000,dport=80,flags='PA',seq=100)/Raw(marker[:12]),
                       IP(src='192.0.2.1',dst='192.0.2.2')/TCP(sport=40000,dport=80,flags='PA',seq=112)/Raw(marker[12:])]
            pcap = out/'synthetic.pcap'
            wrpcap(str(pcap),[Ether(src='00:00:5e:00:53:01',dst='00:00:5e:00:53:02')/p for p in packets])
            def linux(p):
                return '/mnt/'+str(p.resolve())[0].lower()+'/'+p.resolve().as_posix()[3:]
            probe = subprocess.run(['wsl.exe','-d',wsl_distro,'--exec','ffprobe','-v','error','-show_streams','-of','json',linux(wav)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
            check('wsl_ffprobe_reads_windows_fixture', probe.returncode == 0 and json.loads(probe.stdout)['streams'][0]['channels'] == 2)
            streams = out/'streams'
            proc = subprocess.run(['wsl.exe','-d',wsl_distro,'--exec','tcpflow','-r',linux(pcap),'-o',linux(streams)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
            check('tcp_reassembly_across_segments', proc.returncode == 0 and any(marker in f.read_bytes() for f in streams.iterdir() if f.is_file()), {'exit_code':proc.returncode,'diagnostic':proc.stderr[-500:]})
        result['passed'] = all(c['passed'] for c in checks)
    except Exception as exc:
        result['passed'] = False
        result['error'] = f'{type(exc).__name__}: {exc}'
    result['passed_checks'] = sum(c['passed'] for c in checks)
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--wsl-distro')
    args = ap.parse_args()
    raise SystemExit(main(args.out, args.wsl_distro))
