"""Loopback-only Sila preview. Raw GIS companions and scripts are never served."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

ROOT = Path(__file__).resolve().parent
FILES = {"", "index.html", "app.js", "styles.css", "README.md"}
PREFIXES = ("assets/", "vendor/", "data/", "reference/")

class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        requested = unquote(urlsplit(self.path).path).lstrip("/")
        target = (ROOT / requested).resolve()
        if not target.is_relative_to(ROOT) or requested not in FILES and not requested.startswith(PREFIXES):
            self.send_error(404)
            return
        if target.is_dir() and requested:
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        requested = unquote(urlsplit(self.path).path).lstrip("/")
        target = (ROOT / requested).resolve()
        if not target.is_relative_to(ROOT) or requested not in FILES and not requested.startswith(PREFIXES):
            self.send_error(404)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler)
    print(f"Sila Officer preview: http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
