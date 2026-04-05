import re

path = r'frontend/src/pages/DocsPage.tsx'
with open(path, 'rb') as f:
    raw = f.read()

old = b"CSV files are automatically probed for delimiter (comma, semicolon, pipe, tab, colon) via Python\xe2\x80\x99s <code>csv.Sniffer</code>. Non-UTF-8\r\n        encodings (Latin-1, Windows-1252, etc.) are detected with chardet and re-encoded to UTF-8 during ingest"
new = b"CSV files are automatically probed to detect the delimiter (comma, semicolon, pipe, tab, colon). Non-UTF-8 encodings (Latin-1, Windows-1252, etc.) are detected automatically and re-encoded to UTF-8 during ingest"

if old in raw:
    raw = raw.replace(old, new)
    with open(path, 'wb') as f:
        f.write(raw)
    print("SUCCESS: replaced csv.Sniffer + chardet")
else:
    # Try without special apostrophe
    old2 = b"CSV files are automatically probed for delimiter (comma, semicolon, pipe, tab, colon) via Python's <code>csv.Sniffer</code>. Non-UTF-8\r\n        encodings (Latin-1, Windows-1252, etc.) are detected with chardet and re-encoded to UTF-8 during ingest"
    if old2 in raw:
        raw = raw.replace(old2, new)
        with open(path, 'wb') as f:
            f.write(raw)
        print("SUCCESS (ascii apostrophe): replaced csv.Sniffer + chardet")
    else:
        idx = raw.find(b'csv.Sniffer')
        print(f"NOT FOUND. Context around csv.Sniffer: {repr(raw[max(0,idx-60):idx+120])}")
