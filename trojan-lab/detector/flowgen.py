"""Generate synthetic flow CSVs: a clean baseline, and a capture with simulated trojan behaviour.

    python flowgen.py --out ../sample_data
"""
from __future__ import annotations

import argparse
import csv
import os
import random
from datetime import datetime, timezone

FIELDS = ["timestamp", "device", "src_ip", "dst_ip", "dst_port", "protocol", "bytes_out", "bytes_in", "packets", "duration"]
DEVICES = {"cam-lobby": "10.50.0.11", "cam-garage": "10.50.0.12", "cam-office": "10.50.0.13"}
NVR, DNS, NTP, CLOUD = "10.50.0.2", "10.50.0.1", "162.159.200.1", "34.120.10.5"
C2 = "203.0.113.66"
START = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc).timestamp()


def _row(ts, dev, dst, port, proto, out, inn=None, rng=random):
    return {"timestamp": datetime.fromtimestamp(ts, timezone.utc).isoformat(), "device": dev, "src_ip": DEVICES[dev],
            "dst_ip": dst, "dst_port": port, "protocol": proto, "bytes_out": int(out),
            "bytes_in": int(inn if inn is not None else out * 0.05), "packets": max(1, int(out / 900)),
            "duration": round(rng.uniform(0.1, 3), 2)}


def normal(rng, t0, secs):
    rows = []
    for dev in DEVICES:
        t = t0
        while t < t0 + secs:                      # RTSP video to NVR, ~every 10s chunk
            rows.append(_row(t, dev, NVR, 554, "TCP", rng.gauss(2_000_000, 250_000), rng=rng)); t += rng.uniform(9, 11)
        for t in range(int(t0), int(t0 + secs), 300):   # NTP + DNS + cloud heartbeat over TLS
            rows.append(_row(t + rng.uniform(0, 5), dev, NTP, 123, "UDP", 90, rng=rng))
            rows.append(_row(t + rng.uniform(0, 5), dev, DNS, 53, "UDP", rng.randint(70, 120), rng=rng))
            rows.append(_row(t + rng.uniform(0, 30), dev, CLOUD, 443, "TCP", rng.randint(900, 2500), rng=rng))
    return rows


def trojan(rng, dev, t0, secs):
    rows, t = [], t0
    while t < t0 + secs:                          # C2 beacon every ~15s with tiny jitter
        rows.append(_row(t, dev, C2, 4444, "TCP", rng.gauss(310, 12), 120, rng)); t += 15 + rng.uniform(-0.6, 0.6)
    st = t0 + secs * 0.3                          # lateral scan of the lab subnet
    for i in range(30):
        rows.append(_row(st + i * 0.8, dev, f"10.50.0.{100 + i}", 23, "TCP", 60, 0, rng))
    for i, port in enumerate((22, 80, 8080, 2323, 5555, 7547, 37215, 81, 8000, 8081, 9000, 49152)):
        rows.append(_row(st + 30 + i * 0.5, dev, "10.50.0.20", port, "TCP", 60, 0, rng))
    rows.append(_row(t0 + secs * 0.7, dev, "198.51.100.77", 443, "TCP", 8_500_000, 400, rng))  # exfil burst
    return rows


def write(path, rows):
    rows.sort(key=lambda r: r["timestamp"])
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, FIELDS); w.writeheader(); w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="sample_data")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    os.makedirs(a.out, exist_ok=True)
    write(os.path.join(a.out, "baseline_flows.csv"), normal(rng, START, 3600))
    cap = normal(rng, START + 7200, 3600) + trojan(rng, "cam-garage", START + 7200 + 600, 1800)
    write(os.path.join(a.out, "infected_flows.csv"), cap)
    write(os.path.join(a.out, "clean_flows.csv"), normal(rng, START + 7200, 3600))
    print("wrote baseline_flows.csv, infected_flows.csv, clean_flows.csv to", a.out)


if __name__ == "__main__":
    main()
