"""Append flow records to the shared lab CSV (what a Zeek/Suricata export would give the detector)."""
import csv
import fcntl
import os
import socket
from datetime import datetime, timezone

PATH = os.environ.get("FLOW_LOG", "/data/flows.csv")
FIELDS = ["timestamp", "device", "src_ip", "dst_ip", "dst_port", "protocol", "bytes_out", "bytes_in", "packets", "duration"]


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.50.0.254", 9))  # no packet is sent for UDP connect; just picks the lab interface
        return s.getsockname()[0]
    except OSError:
        return "0.0.0.0"
    finally:
        s.close()


def log(device, src_ip, dst_ip, dst_port, protocol, bytes_out, bytes_in=0, duration=0.1):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    with open(PATH, "a", newline="") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        w = csv.writer(fh)
        if fh.tell() == 0:
            w.writerow(FIELDS)
        w.writerow([datetime.now(timezone.utc).isoformat(), device, src_ip, dst_ip, dst_port, protocol,
                    int(bytes_out), int(bytes_in), max(1, int(bytes_out) // 900), round(duration, 2)])
