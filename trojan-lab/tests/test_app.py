import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "detector"))
import pytest  # noqa: E402

import app as appmod  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(appmod, "QUARANTINE", tmp_path / "q")
    monkeypatch.setattr(appmod, "LIVE_FLOWS", tmp_path / "flows.csv")
    monkeypatch.setattr(appmod, "SAMPLES", ROOT / "sample_data")
    appmod._state["baseline"] = None
    return appmod.app.test_client()


def up(client, flows, baseline=None):
    data = {"flows": (io.BytesIO(flows), "f.csv")}
    if baseline is not None:
        data["baseline"] = (io.BytesIO(baseline), "b.csv")
    return client.post("/api/analyze", data=data, content_type="multipart/form-data")


def test_upload_with_baseline(client):
    s = ROOT / "sample_data"
    r = up(client, (s / "infected_flows.csv").read_bytes(), (s / "baseline_flows.csv").read_bytes())
    j = r.get_json()
    assert r.status_code == 200 and j["summary"]["compromised"] == 1 and j["summary"]["with_baseline"]


def test_upload_rejects_bad_csv(client):
    r = up(client, b"a,b\n1,2\n")
    assert r.status_code == 400 and "missing required" in r.get_json()["error"]


def test_no_file(client):
    assert client.post("/api/analyze").status_code == 400


def test_sample_and_quarantine_roundtrip(client):
    assert client.post("/api/analyze/sample", json={"name": "infected"}).get_json()["summary"]["compromised"] == 1
    assert client.post("/api/analyze/sample", json={"name": "../etc/passwd"}).status_code == 400
    assert client.post("/api/quarantine/cam-garage").status_code == 200
    assert client.post("/api/analyze/sample", json={"name": "clean"}).get_json()["quarantined"] == ["cam-garage"]
    client.delete("/api/quarantine/cam-garage")
    assert not (appmod.QUARANTINE / "cam-garage").exists()


def test_quarantine_rejects_traversal(client):
    assert client.post("/api/quarantine/..%2Fx").status_code in (400, 404)


def test_live_capture_missing_gives_actionable_error(client):
    for path in ("/api/analyze/live", "/api/baseline/live"):
        r = client.post(path)
        err = r.get_json()["error"]
        assert r.status_code == 404 and "local_lab.py" in err and str(appmod.LIVE_FLOWS) in err


def test_live_capture_present(client):
    appmod.LIVE_FLOWS.write_bytes((ROOT / "sample_data" / "infected_flows.csv").read_bytes())
    assert client.post("/api/analyze/live").get_json()["summary"]["compromised"] == 1
