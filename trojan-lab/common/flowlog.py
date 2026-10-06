"""Append flow records to the shared lab CSV (what a Zeek/Suricata export would give the detector).

Works on Linux, macOS and Windows. Concurrent writers (several simulators) are serialised with a lock: fcntl.flock on POSIX,
msvcrt.locking on a side-car ".lock" file on Windows (a side-car so a reader such as the detector is never blocked on the data file).
"""
import csv
import os
import socket
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone

try:                                   # POSIX
    import fcntl

    @contextmanager
    def _locked(fh, path):
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)
except ImportError:                    # Windows
    import msvcrt

    @contextmanager
    def _locked(fh, path):
        with open(path + ".lock", "a+") as lock:
            lock.seek(0)
            while True:
                try:
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(0.01)
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def default_data_dir():
    """/data in the Docker lab; a folder under the system temp directory when running directly (notably on Windows)."""
    if os.environ.get("LAB_DATA_DIR"):
        return os.environ["LAB_DATA_DIR"]
    return "/data" if os.name != "nt" else os.path.join(tempfile.gettempdir(), "trojan-lab-data")


DATA_DIR = default_data_dir()
PATH = os.environ.get("FLOW_LOG", os.path.join(DATA_DIR, "flows.csv"))
FIELDS = ["timestamp", "device", "src_ip", "dst_ip", "dst_port", "protocol", "bytes_out", "bytes_in", "packets", "duration"]


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.50.0.254", 9))  # no packet is sent for UDP connect; just picks the outgoing interface
        return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        s.close()


def log(device, src_ip, dst_ip, dst_port, protocol, bytes_out, bytes_in=0, duration=0.1):
    os.makedirs(os.path.dirname(PATH) or ".", exist_ok=True)
    with open(PATH, "a", newline="") as fh:
        with _locked(fh, PATH):
            w = csv.writer(fh)
            fh.seek(0, os.SEEK_END)    # tell() alone can be stale in append mode when another writer got in first
            if fh.tell() == 0:
                w.writerow(FIELDS)
            w.writerow([datetime.now(timezone.utc).isoformat(), device, src_ip, dst_ip, dst_port, protocol,
                        int(bytes_out), int(bytes_in), max(1, int(bytes_out) // 900), round(duration, 2)])
            fh.flush()
