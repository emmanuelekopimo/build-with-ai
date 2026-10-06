"""Web UI + API: upload a flow CSV (and optional baseline CSV), see detections, quarantine a device."""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request

import engine

DATA_DIR = Path(os.environ.get("LAB_DATA_DIR") or ("/data" if os.name != "nt" else os.path.join(tempfile.gettempdir(), "trojan-lab-data")))
LIVE_FLOWS = DATA_DIR / "flows.csv"
QUARANTINE = DATA_DIR / "quarantine"
SAMPLES = Path(os.environ.get("SAMPLE_DIR", Path(__file__).parent.parent / "sample_data"))
MAX_UPLOAD = 25 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD
_state: dict = {"baseline": None}


def _analyse(capture: bytes | str, baseline: bytes | str | None):
    base = engine.build_baseline(engine.parse_csv(baseline)) if baseline else _state["baseline"]
    if baseline:
        _state["baseline"] = base
    result = engine.detect(engine.parse_csv(capture), base)
    result["quarantined"] = sorted(p.name for p in QUARANTINE.glob("*")) if QUARANTINE.exists() else []
    return result


@app.errorhandler(engine.FlowError)
def _flow_error(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(413)
def _too_big(_):
    return jsonify(error=f"file too large (max {MAX_UPLOAD // 1048576} MB)"), 413


@app.get("/")
def index():
    return render_template("index.html", required=engine.REQUIRED)


@app.post("/api/analyze")
def analyze():
    f, b = request.files.get("flows"), request.files.get("baseline")
    if not f or not f.filename:
        return jsonify(error="upload a flow CSV in the 'flows' field"), 400
    return jsonify(_analyse(f.read(), b.read() if b and b.filename else None))


@app.post("/api/analyze/sample")
def analyze_sample():
    name = request.json.get("name", "") if request.is_json else ""
    if name not in ("infected", "clean"):
        return jsonify(error="name must be 'infected' or 'clean'"), 400
    base = (SAMPLES / "baseline_flows.csv").read_bytes()
    return jsonify(_analyse((SAMPLES / f"{name}_flows.csv").read_bytes(), base))


@app.post("/api/analyze/live")
def analyze_live():
    if not LIVE_FLOWS.exists():
        return jsonify(error=f"no live capture at {LIVE_FLOWS} yet (start the lab)"), 404
    return jsonify(_analyse(LIVE_FLOWS.read_bytes(), None))


@app.post("/api/baseline/live")
def baseline_live():
    """Freeze the current live capture as the 'known good' baseline (demo step 2)."""
    if not LIVE_FLOWS.exists():
        return jsonify(error="no live capture yet"), 404
    _state["baseline"] = engine.build_baseline(engine.parse_csv(LIVE_FLOWS.read_bytes()))
    return jsonify(ok=True, devices=sorted(_state["baseline"]))


@app.post("/api/quarantine/<device>")
def quarantine(device):
    """Response action. In the lab this drops a marker file that the trojan simulator honours."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", device):
        return jsonify(error="invalid device name"), 400
    QUARANTINE.mkdir(parents=True, exist_ok=True)
    (QUARANTINE / device).write_text("quarantined by detector\n")
    return jsonify(ok=True, device=device)


@app.delete("/api/quarantine/<device>")
def release(device):
    if re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", device):
        (QUARANTINE / device).unlink(missing_ok=True)
    return jsonify(ok=True)


@app.get("/health")
def health():
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
