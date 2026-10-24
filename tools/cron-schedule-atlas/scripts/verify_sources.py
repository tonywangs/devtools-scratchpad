"""Verify pinned public bytes; --remote also refetches without changing fixtures."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remote', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'fixtures/manifest.json').read_text())
    for source in manifest['sources']:
        data = (ROOT / source['local']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == source['sha256'], source['local']
        if args.remote:
            with urlopen(source['url'], timeout=30) as response:
                remote = response.read(131073)
            assert remote == data, source['url']
        print('VERIFIED', source['local'], source['sha256'])

if __name__ == '__main__':
    main()
