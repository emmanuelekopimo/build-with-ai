"""Fake C2 listener: accepts TCP beacons, replies 'ACK', logs them. Harmless."""
import socketserver
from datetime import datetime


class H(socketserver.BaseRequestHandler):
    def handle(self):
        data = self.request.recv(256)
        print(f"{datetime.now():%H:%M:%S} beacon from {self.client_address[0]}: {data[:80]!r}", flush=True)
        self.request.sendall(b"ACK")


class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    print("fake C2 listening on :4444", flush=True)
    S(("0.0.0.0", int(__import__("os").environ.get("PORT", 4444))), H).serve_forever()
