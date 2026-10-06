import csv
import os
import importlib
import sys
import threading
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "common"))
sys.path.insert(0, str(ROOT / "camera"))


def _rows(path):
    with open(path, newline="") as fh:
        return list(csv.reader(fh))


def _hammer(flowlog, n_threads=4, per_thread=15):
    ts = [threading.Thread(target=lambda i=i: [flowlog.log(f"d{i}", "10.0.0.1", "10.0.0.2", 443, "TCP", 1000 + j) for j in range(per_thread)])
          for i in range(n_threads)]
    [t.start() for t in ts]
    [t.join() for t in ts]


def test_flowlog_header_once_and_all_rows(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOW_LOG", str(tmp_path / "flows.csv"))
    import flowlog
    flowlog = importlib.reload(flowlog)
    _hammer(flowlog)
    rows = _rows(tmp_path / "flows.csv")
    assert rows[0] == flowlog.FIELDS and len(rows) == 1 + 4 * 15
    assert all(len(r) == len(flowlog.FIELDS) for r in rows)


def test_flowlog_windows_fallback_path(tmp_path, monkeypatch):
    """No fcntl available: the msvcrt side-car lock path is used. msvcrt is faked here (real Windows is not available in CI)."""
    held, guard = set(), threading.Lock()
    fake = types.ModuleType("msvcrt")
    fake.LK_NBLCK, fake.LK_UNLCK = 2, 0

    def locking(fd, mode, nbytes):
        with guard:
            if mode == fake.LK_NBLCK:
                if "lock" in held:
                    raise OSError("locked")
                held.add("lock")
            else:
                held.discard("lock")
    fake.locking = locking
    monkeypatch.setitem(sys.modules, "msvcrt", fake)
    monkeypatch.setitem(sys.modules, "fcntl", None)          # makes "import fcntl" raise ImportError
    monkeypatch.setenv("FLOW_LOG", str(tmp_path / "flows.csv"))
    import flowlog
    try:
        flowlog = importlib.reload(flowlog)
        _hammer(flowlog)
        rows = _rows(tmp_path / "flows.csv")
        assert rows[0] == flowlog.FIELDS and len(rows) == 1 + 4 * 15
        assert (tmp_path / "flows.csv.lock").exists() and not held
    finally:
        monkeypatch.undo()
        importlib.reload(flowlog)


def test_default_data_dir_env(monkeypatch):
    import flowlog
    monkeypatch.setenv("LAB_DATA_DIR", "/somewhere")
    assert flowlog.default_data_dir() == "/somewhere"


@pytest.fixture
def cam():
    pytest.importorskip("PIL")
    import camera
    return camera, camera.app.test_client()


AUTH = {"Authorization": "Basic YWRtaW46YWRtaW4="}   # admin:admin


def test_camera_requires_login(cam):
    _, c = cam
    for url in ("/", "/stream", "/snapshot.jpg"):
        assert c.get(url).status_code == 401


def test_camera_snapshot_is_jpeg(cam):
    _, c = cam
    r = c.get("/snapshot.jpg", headers=AUTH)
    assert r.status_code == 200 and r.mimetype == "image/jpeg" and r.data[:3] == b"\xff\xd8\xff"


def test_camera_stream_is_live_mjpeg(cam):
    camera, c = cam
    r = c.get("/stream", headers=AUTH, buffered=False)
    assert r.mimetype == "multipart/x-mixed-replace"
    first, second = next(r.response), next(r.response)
    assert first.startswith(b"--frame") and b"image/jpeg" in first and second.startswith(b"--frame")
    assert first != second                                   # frames change over time (motion, timestamp, noise)
    r.close()


def test_camera_shows_compromise_when_infected_marker_present(cam, tmp_path, monkeypatch):
    camera, c = cam
    monkeypatch.setattr(camera, "INFECTED_MARKER", str(tmp_path / "infected" / "cam-lobby"))
    clean = c.get("/snapshot.jpg", headers=AUTH).data
    os.makedirs(tmp_path / "infected")
    (tmp_path / "infected" / "cam-lobby").write_text("x")
    infected = c.get("/snapshot.jpg", headers=AUTH).data
    assert clean != infected and len(infected) > 100
    admin_html = c.get("/", headers=AUTH).data
    assert b"COMPROMISED" in admin_html
