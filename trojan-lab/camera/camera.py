"""Simulated IP camera: weak-login admin page + realistic background flows (video to NVR, NTP, DNS, cloud)."""
import os
import random
import sys
import threading
import time

from flask import Flask, Response, request

sys.path.insert(0, os.environ.get("COMMON_DIR", "/app/common"))
import flowlog  # noqa: E402

DEVICE = os.environ.get("DEVICE", "cam-lobby")
NVR, DNS, NTP, CLOUD = "10.50.0.2", "10.50.0.1", "162.159.200.1", "34.120.10.5"
IP = flowlog.my_ip()
app = Flask(__name__)


@app.route("/")
def admin():
    auth = request.authorization
    if not auth or (auth.username, auth.password) != ("admin", "admin"):   # intentionally weak default creds
        return Response("Login required", 401, {"WWW-Authenticate": 'Basic realm="IPCam"'})
    return f"<h1>{DEVICE}</h1><p>Firmware 1.0.3 (simulated) &middot; stream: rtsp://rtsp:8554/cam</p>"


def traffic():
    n = 0
    while True:
        flowlog.log(DEVICE, IP, NVR, 554, "TCP", random.gauss(2_000_000, 250_000))
        if n % 6 == 0:
            flowlog.log(DEVICE, IP, NTP, 123, "UDP", 90)
            flowlog.log(DEVICE, IP, DNS, 53, "UDP", random.randint(70, 120))
            flowlog.log(DEVICE, IP, CLOUD, 443, "TCP", random.randint(900, 2500))
        n += 1
        time.sleep(random.uniform(9, 11))


if __name__ == "__main__":
    threading.Thread(target=traffic, daemon=True).start()
    app.run(host="0.0.0.0", port=80)
