#!/usr/bin/env python3
"""update.json of a release: what the TV and the phone app read to update themselves (see src/.../Updater.java).

    python3 tools/update_json.py <versionName> <versionCode> <tag> <owner/repo> <build dir>

Writes <build dir>/update.json with, for each APK ("tv": TV-Drop.apk, "celular": TV-Drop-Celular.apk), the download
address of that release on GitHub, the size and the SHA-256 (the app refuses a download that doesn't match).
"""
import hashlib
import json
import os
import sys


def main():
    name, code, tag, repo, folder = sys.argv[1:6]
    apks = {}
    for kind, file in (('tv', 'TV-Drop.apk'), ('celular', 'TV-Drop-Celular.apk')):
        path = os.path.join(folder, file)
        with open(path, 'rb') as f:
            data = f.read()
        apks[kind] = {
            'file': file,
            'url': 'https://github.com/%s/releases/download/%s/%s' % (repo, tag, file),
            'size': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
        }
    out = {'versionCode': int(code), 'versionName': name, 'tag': tag,
           'notes': 'Veja as novidades em https://github.com/%s/releases/tag/%s' % (repo, tag), 'apks': apks}
    with open(os.path.join(folder, 'update.json'), 'w') as f:
        json.dump(out, f, indent=2)
    print('update.json: %s (%s)' % (name, code))


if __name__ == '__main__':
    main()
