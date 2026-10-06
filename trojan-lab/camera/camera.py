"""Simulated IP camera.

  * admin page with a deliberately weak login (admin/admin), like many real cheap cameras
  * LIVE video: GET /stream is an MJPEG stream of synthetic frames (moving figure, timestamp, "REC" light), viewable in any
    browser or VLC with no ffmpeg, Docker or physical camera. GET /snapshot.jpg returns a single frame.
  * realistic background flows (video to NVR, NTP, DNS, cloud heartbeat) appended to the shared flow log

Env: DEVICE (name), PORT (default 80), FPS (default 8), COMMON_DIR (where flowlog.py lives).
"""
import io
import os
import random
import sys
import threading
import time
from datetime import datetime

from flask import Flask, Response, request
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.environ.get("COMMON_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common")))
import flowlog  # noqa: E402

DEVICE = os.environ.get("DEVICE", "cam-lobby")
FPS = max(1, min(30, int(os.environ.get("FPS", "8"))))
NVR, DNS, NTP, CLOUD = "10.50.0.2", "10.50.0.1", "162.159.200.1", "34.120.10.5"
IP = flowlog.my_ip()
W, H = 640, 360
app = Flask(__name__)


def _font(size):
    try:
        return ImageFont.load_default(size=size)       # Pillow >= 10.1 ships a scalable default font
    except TypeError:
        return ImageFont.load_default()


FONT_BIG, FONT_SMALL = _font(20), _font(14)


def frame(i):
    """One synthetic surveillance-style frame as JPEG bytes."""
    img = Image.new("RGB", (W, H), (20, 27, 36))
    d = ImageDraw.Draw(img)
    for gx in range(0, W, 80):                          # floor/wall grid so motion is easy to see
        d.line([gx, 0, gx, H], fill=(30, 40, 52))
    for gy in range(0, H, 60):
        d.line([0, gy, W, gy], fill=(30, 40, 52))
    x = (i * 5) % (W + 120) - 60                        # a figure walking across the scene
    bob = int(4 * ((i // 3) % 2))
    d.ellipse([x + 10, 150 + bob, x + 34, 174 + bob], fill=(214, 172, 142))
    d.rectangle([x + 6, 176 + bob, x + 38, 250 + bob], fill=(58, 130, 160))
    d.rectangle([x + 6, 250 + bob, x + 20, 300], fill=(40, 60, 90))
    d.rectangle([x + 24, 250 + bob, x + 38, 300], fill=(40, 60, 90))
    for _ in range(40):                                 # sensor noise
        nx, ny = random.randrange(W), random.randrange(H)
        d.point((nx, ny), fill=(70, 80, 90))
    d.text((12, 10), f"{DEVICE}  |  LIVE (simulated)", fill=(235, 235, 235), font=FONT_BIG)
    d.text((12, H - 26), datetime.now().strftime("%Y-%m-%d  %H:%M:%S"), fill=(235, 235, 235), font=FONT_SMALL)
    if (i // FPS) % 2 == 0:                             # blinking REC light
        d.ellipse([W - 70, 12, W - 54, 28], fill=(220, 40, 50))
    d.text((W - 48, 10), "REC", fill=(235, 235, 235), font=FONT_SMALL)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return buf.getvalue()


def _authorised():
    a = request.authorization
    return bool(a) and (a.username, a.password) == ("admin", "admin")   # intentionally weak default creds


def _login():
    return Response("Login required", 401, {"WWW-Authenticate": 'Basic realm="IPCam"'})


def mjpeg():
    i = 0
    while True:
        jpg = frame(i)
        yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n"
        i += 1
        time.sleep(1 / FPS)


@app.route("/")
def admin():
    if not _authorised():
        return _login()
    return (f"<!doctype html><title>{DEVICE}</title><body style='font-family:sans-serif'><h1>{DEVICE}</h1>"
            f"<p>Firmware 1.0.3 (simulated) &middot; live view below &middot; "
            f"<a href='/snapshot.jpg'>snapshot</a> &middot; stream: <code>/stream</code> (MJPEG)</p>"
            f"<img src='/stream' width='{W}' height='{H}' alt='live stream'></body>")


@app.route("/stream")
def stream():
    if not _authorised():
        return _login()
    return Response(mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/snapshot.jpg")
def snapshot():
    if not _authorised():
        return _login()
    return Response(frame(int(time.time() * FPS)), mimetype="image/jpeg")


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
    app.run(host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "80")), threaded=True)
