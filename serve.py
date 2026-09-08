"""Static server for the exam atlas. Sends an explicit UTF-8 charset —
without it browsers guess the encoding and mojibake the rupee signs,
em dashes and the ◆/◇/○ confidence marks."""
import http.server
import socketserver

PORT = 3000


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        ctype = super().guess_type(path)
        if ctype.startswith("text/") and "charset=" not in ctype:
            ctype += "; charset=utf-8"
        return ctype

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving on http://localhost:{PORT}")
        httpd.serve_forever()
