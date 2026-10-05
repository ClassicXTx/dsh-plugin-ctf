"""Read-only, namespace-agnostic Windows Event XML to a bounded evidence timeline."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def local(tag):
    return tag.rsplit('}', 1)[-1]


def analyze(path):
    raw = path.read_bytes()
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('XML DTD/entities are not accepted')
    records = []
    for event in ET.fromstring(raw).iter():
        if local(event.tag) != 'Event':
            continue
        row = {'time': None, 'event_id': None, 'record_id': None, 'provider': None, 'data': {}}
        for item in event.iter():
            tag = local(item.tag)
            if tag == 'TimeCreated':
                row['time'] = item.get('SystemTime')
            elif tag == 'EventID':
                row['event_id'] = item.text
            elif tag == 'EventRecordID':
                row['record_id'] = item.text
            elif tag == 'Provider':
                row['provider'] = item.get('Name')
            elif tag == 'Data':
                key = item.get('Name') or str(len(row['data']))
                if key in row['data']:
                    key += '#' + str(len(row['data']))
                row['data'][key] = ''.join(item.itertext())
        records.append(row)
    from datetime import datetime
    def sort_key(row):
        if row['time'] is None:
            return float('-inf')
        parsed = datetime.fromisoformat(row['time'].replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('Timezone missing in event timestamp: ' + row['time'])
        return parsed.timestamp()
    records.sort(key=sort_key)
    return {'schema': 1, 'path': str(path.resolve()), 'sha256': hashlib.sha256(raw).hexdigest(),
            'events': len(records), 'missing_time': sum(r['time'] is None for r in records),
            'event_id_counts': dict(collections.Counter(r['event_id'] for r in records)), 'records': records}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('path', type=Path)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    result = analyze(args.path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.resolve() == args.path.resolve():
        raise ValueError('Output must differ from original evidence')
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'records'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
