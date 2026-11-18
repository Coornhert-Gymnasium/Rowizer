"""Lokale testserver zonder browsercache.

    python scripts/dev-server.py [poort]

De gewone `python -m http.server` laat de browser ES-modules uit de cache halen, waardoor
je na een wijziging nog de oude code test.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
