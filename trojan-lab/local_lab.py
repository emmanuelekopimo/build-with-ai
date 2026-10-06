"""Run the whole lab on one machine with no Docker: fake C2, two simulated live cameras, the detector, and (on demand) the trojan.

    python trojan-lab/local_lab.py            # works on Windows, macOS and Linux

Then open http://localhost:8080 (detector), http://localhost:8081 (cam-lobby live view, admin/admin) and :8082 (cam-garage).
Press Enter in this terminal to "infect" cam-garage; Ctrl+C stops everything and removes the simulated persistence files.

Everything binds to 127.0.0.1 and the simulated scan targets 127.0.0.x, so nothing leaves your machine.
"""
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = Path(tempfile.gettempdir()) / "trojan-lab-data"
PY = sys.executable


def spawn(script, **extra):
    env = {**os.environ, "COMMON_DIR": str(HERE / "common"), "LAB_DATA_DIR": str(DATA), "FLOW_LOG": str(DATA / "flows.csv"),
           "HOST": "127.0.0.1", "PYTHONUNBUFFERED": "1", **{k: str(v) for k, v in extra.items()}}
    return subprocess.Popen([PY, str(HERE / script)], env=env, cwd=str(HERE / Path(script).parent))


def _stop(*_):
    raise KeyboardInterrupt      # lets 'kill' / task managers shut the lab down cleanly too


def main():
    for name in ("SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), _stop)
    if DATA.exists():
        shutil.rmtree(DATA, ignore_errors=True)         # start from a clean capture and no old quarantine markers
    DATA.mkdir(parents=True)
    procs = []
    try:
        procs.append(spawn("c2/c2.py", PORT=4444))
        procs.append(spawn("camera/camera.py", DEVICE="cam-lobby", PORT=8081))
        procs.append(spawn("camera/camera.py", DEVICE="cam-garage", PORT=8082))
        procs.append(spawn("detector/app.py", PORT=8080))
        time.sleep(2)
        print("\nLab running (data in %s)\n" % DATA)
        print("  Detector            http://localhost:8080")
        print("  cam-lobby (live)    http://localhost:8081   login admin / admin")
        print("  cam-garage (live)   http://localhost:8082   login admin / admin")
        print("\nSuggested demo: wait ~1 minute, click 'Freeze live capture as baseline' in the detector,")
        input("then press Enter here to infect cam-garage with the harmless simulator... ")
        trojan = spawn("trojan_sim/kworker_upd.py", DEVICE="cam-garage", C2_HOST="127.0.0.1", C2_PORT=4444, BEACON_INTERVAL=5,
                       SCAN_PREFIX="127.0.0.")
        procs.append(trojan)
        print("Trojan simulator started. After ~1 minute click 'Analyse live lab capture', then Quarantine cam-garage.")
        print("Ctrl+C to stop the lab.")
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        for p in procs:
            p.terminate()
        for p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        for f in (Path(tempfile.gettempdir()) / ".kworker-update", Path(tempfile.gettempdir()) / "cron.d" / "kworker"):
            f.unlink(missing_ok=True)
        print("Lab stopped.")


if __name__ == "__main__":
    main()
