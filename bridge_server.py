"""
Alibaba Inquiry Bridge Server
Receives inquiry alerts from Chrome extension via HTTP and writes to workspace file.
Accio cron checks this file to trigger AI processing.

Usage: python bridge_server.py
Port: 9876 (localhost only)
"""
import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

WORKSPACE = os.path.dirname(os.path.abspath(__file__))
PENDING_FILE = os.path.join(WORKSPACE, "pending_inquiries.json")
KNOWN_FILE = os.path.join(WORKSPACE, "known_inquiries.json")


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {args[0]}")

    def _ok(self, body=""):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body.encode())

    def _err(self, code, msg):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg.encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            self._ok("pong")
        elif self.path == "/status":
            pending = []
            known = []
            if os.path.exists(PENDING_FILE):
                with open(PENDING_FILE, "r") as f:
                    pending = json.load(f)
            if os.path.exists(KNOWN_FILE):
                with open(KNOWN_FILE, "r") as f:
                    known = json.load(f)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "pending_count": len(pending),
                "known_count": len(known),
                "pending": pending[-5:],
            }).encode())
        else:
            self._err(404, "not found")

    def do_POST(self):
        if self.path == "/inquiry":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._err(400, "invalid json")
                return

            inquiry_id = data.get("inquiryId", "unknown")
            buyer_name = data.get("buyerName", "Unknown")
            preview = data.get("preview", "")
            url = data.get("url", "")

            # Read existing pending inquiries
            pending = []
            if os.path.exists(PENDING_FILE):
                with open(PENDING_FILE, "r") as f:
                    pending = json.load(f)

            # Don't duplicate
            existing_ids = {p["inquiryId"] for p in pending}
            if inquiry_id not in existing_ids:
                pending.append({
                    "inquiryId": inquiry_id,
                    "buyerName": buyer_name,
                    "preview": preview,
                    "url": url,
                    "detectedAt": datetime.now().isoformat(),
                })
                with open(PENDING_FILE, "w") as f:
                    json.dump(pending, f, indent=2, ensure_ascii=False)
                print(f"  -> NEW inquiry #{inquiry_id} from {buyer_name}")
                self._ok("queued")
            else:
                print(f"  -> DUPLICATE inquiry #{inquiry_id}")
                self._ok("duplicate")
        else:
            self._err(404, "not found")


def main():
    port = 9876
    server = HTTPServer(("127.0.0.1", port), BridgeHandler)
    print(f"[Bridge] Listening on http://127.0.0.1:{port}")
    print(f"[Bridge] Workspace: {WORKSPACE}")
    print(f"[Bridge] Pending file: {PENDING_FILE}")
    print(f"[Bridge] Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Bridge] Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
