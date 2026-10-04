import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "detector"))
import engine  # noqa: E402

S = ROOT / "sample_data"


def run(name, with_baseline=True):
    base = engine.build_baseline(engine.parse_csv((S / "baseline_flows.csv").read_bytes())) if with_baseline else None
    return engine.detect(engine.parse_csv((S / f"{name}_flows.csv").read_bytes()), base)


@pytest.mark.parametrize("bl", [True, False])
def test_clean_capture_has_no_findings(bl):
    r = run("clean", bl)
    assert r["findings"] == []
    assert all(d["status"] == "clean" for d in r["devices"])


@pytest.mark.parametrize("bl", [True, False])
def test_infected_device_flagged_others_clean(bl):
    r = run("infected", bl)
    st = {d["device"]: d["status"] for d in r["devices"]}
    assert st["cam-garage"] == "compromised"
    assert st["cam-lobby"] == st["cam-office"] == "clean"
    rules = {f["rule"] for f in r["findings"]}
    assert {"beaconing", "known_bad_ip", "suspicious_port", "scan_hosts", "exfil_volume"} <= rules


def test_beacon_interval_reported():
    f = next(f for f in run("infected")["findings"] if f["rule"] == "beaconing")
    assert f["evidence"]["dst_ip"] == "203.0.113.66"
    assert 14 < f["evidence"]["interval_s"] < 16


def test_column_aliases_and_epoch():
    csv_ = "ts,device_id,src,dst,dport,proto,bytes\n" + "\n".join(
        f"{1700000000 + i * 30},d1,10.0.0.5,8.8.4.4,9999,tcp,200" for i in range(8))
    r = engine.detect(engine.parse_csv(csv_), None)
    assert any(f["rule"] == "beaconing" for f in r["findings"])


def test_missing_columns_message():
    with pytest.raises(engine.FlowError, match="missing required column.*dst_port"):
        engine.parse_csv("timestamp,device,src_ip,dst_ip,protocol,bytes_out\n1,a,b,c,tcp,1\n")


@pytest.mark.parametrize("bad", ["", "timestamp,device\n"])
def test_empty_or_headers_only(bad):
    with pytest.raises(engine.FlowError):
        engine.parse_csv(bad)


def test_irregular_traffic_not_beacon():
    import random
    rng = random.Random(1)
    t, rows = 0, []
    for _ in range(30):
        t += rng.uniform(1, 120)
        rows.append(f"{1700000000 + t},d1,10.0.0.5,8.8.4.4,443,tcp,{rng.randint(100, 90000)}")
    r = engine.detect(engine.parse_csv("ts,device,src,dst,dport,proto,bytes\n" + "\n".join(rows)), None)
    assert not any(f["rule"] == "beaconing" for f in r["findings"])
