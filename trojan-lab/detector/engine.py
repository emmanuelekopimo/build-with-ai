"""Network-flow analysis engine for spotting trojan-like behaviour on IoT devices.

Input is a CSV of flow records. Required columns (aliases accepted):
    timestamp, device, src_ip, dst_ip, dst_port, protocol, bytes_out
Optional: bytes_in, packets, duration, src_port

Pure stdlib so it can be unit-tested and reused outside the web app.
"""
from __future__ import annotations

import csv
import io
import ipaddress
import statistics
from collections import defaultdict
from datetime import datetime, timezone

REQUIRED = ["timestamp", "device", "src_ip", "dst_ip", "dst_port", "protocol", "bytes_out"]
ALIASES = {
    "timestamp": ["ts", "time", "start_time", "flow_start"],
    "device": ["device_id", "device_name", "host", "hostname"],
    "src_ip": ["source_ip", "src", "srcaddr"],
    "dst_ip": ["destination_ip", "dst", "dstaddr"],
    "dst_port": ["dport", "destination_port", "dstport"],
    "protocol": ["proto"],
    "bytes_out": ["bytes", "orig_bytes", "bytes_sent", "out_bytes"],
    "bytes_in": ["resp_bytes", "bytes_received", "in_bytes"],
}

# Ports a camera is expected to talk on: DNS, NTP, HTTP(S), RTSP, MQTT, mDNS, ONVIF.
DEFAULT_ALLOWED_PORTS = {53, 80, 123, 443, 554, 1883, 3702, 5353, 8554, 8883}
SUSPICIOUS_PORTS = {23: "Telnet", 2323: "Telnet-alt", 4444: "Metasploit default", 6667: "IRC C2",
                    1337: "common backdoor", 31337: "Back Orifice", 9001: "Tor ORPort", 12345: "NetBus"}
KNOWN_BAD_IPS: set[str] = {"203.0.113.66", "198.51.100.77"}  # documentation ranges used by the lab

BEACON_MIN_EVENTS = 6
BEACON_MAX_CV = 0.25          # coefficient of variation of inter-arrival times
BEACON_MAX_BYTES_CV = 0.5     # beacons are also similar in size
SCAN_WINDOW_S = 60
SCAN_MIN_TARGETS = 10         # distinct dst_ip or dst_port in a window
EXFIL_ABS_BYTES = 5_000_000   # to a non-private address
EXFIL_SIGMA = 4.0

SEVERITY_SCORE = {"critical": 40, "high": 25, "medium": 10, "low": 3}


class FlowError(ValueError):
    pass


def _parse_ts(v: str) -> float:
    v = str(v).strip()
    try:
        return float(v)
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError as e:
        raise FlowError(f"unparseable timestamp: {v!r}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


_INTERNAL = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "224.0.0.0/4", "fe80::/10")]


def _is_private(ip: str) -> bool:
    """LAN-side address. Deliberately NOT ipaddress.is_private: that also covers the
    TEST-NET documentation ranges, which the lab uses to stand in for internet hosts."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(a in n for n in _INTERNAL if n.version == a.version)


def parse_csv(data: str | bytes) -> list[dict]:
    """Parse and normalise a flow CSV. Raises FlowError with a user-readable message."""
    if isinstance(data, bytes):
        data = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(data))
    if not reader.fieldnames:
        raise FlowError("CSV is empty or has no header row")
    cols = {c.strip().lower(): c for c in reader.fieldnames}
    mapping: dict[str, str] = {}
    for canon in REQUIRED + ["bytes_in", "packets", "duration"]:
        for name in [canon] + ALIASES.get(canon, []):
            if name in cols:
                mapping[canon] = cols[name]
                break
    missing = [c for c in REQUIRED if c not in mapping]
    if missing:
        raise FlowError(f"missing required column(s): {', '.join(missing)}. "
                        f"Found: {', '.join(reader.fieldnames)}")
    rows, bad = [], 0
    for i, r in enumerate(reader, start=2):
        try:
            rows.append({
                "ts": _parse_ts(r[mapping["timestamp"]]),
                "device": r[mapping["device"]].strip(),
                "src_ip": r[mapping["src_ip"]].strip(),
                "dst_ip": r[mapping["dst_ip"]].strip(),
                "dst_port": int(float(r[mapping["dst_port"]])),
                "protocol": r[mapping["protocol"]].strip().upper(),
                "bytes_out": int(float(r[mapping["bytes_out"]] or 0)),
                "bytes_in": int(float(r[mapping["bytes_in"]] or 0)) if "bytes_in" in mapping else 0,
            })
        except (ValueError, TypeError, KeyError, FlowError):
            bad += 1
            if bad > 50:
                raise FlowError(f"too many malformed rows (last at line {i})")
    if not rows:
        raise FlowError("no valid flow rows found")
    rows.sort(key=lambda r: r["ts"])
    return rows


def build_baseline(flows: list[dict]) -> dict:
    """Per-device profile of normal behaviour from known-good traffic."""
    prof: dict[str, dict] = defaultdict(lambda: {"ports": set(), "dsts": set(), "pairs": set(), "bytes": []})
    for f in flows:
        p = prof[f["device"]]
        p["ports"].add(f["dst_port"])
        p["dsts"].add(f["dst_ip"])
        p["pairs"].add((f["dst_ip"], f["dst_port"]))
        p["bytes"].append(f["bytes_out"])
    out = {}
    for dev, p in prof.items():
        b = p["bytes"]
        out[dev] = {"ports": p["ports"], "dsts": p["dsts"], "pairs": p["pairs"], "flows": len(b),
                    "mean_bytes": statistics.fmean(b),
                    "std_bytes": statistics.pstdev(b) if len(b) > 1 else 0.0}
    return out


def _finding(device, rule, severity, title, detail, mitre, evidence=None, first=None, last=None):
    return {"device": device, "rule": rule, "severity": severity, "title": title, "detail": detail,
            "mitre": mitre, "evidence": evidence or {}, "first_seen": first, "last_seen": last}


def _cv(xs: list[float]) -> float:
    m = statistics.fmean(xs)
    return statistics.pstdev(xs) / m if m else float("inf")


def detect(flows: list[dict], baseline: dict | None = None) -> dict:
    findings: list[dict] = []
    by_dev: dict[str, list[dict]] = defaultdict(list)
    for f in flows:
        by_dev[f["device"]].append(f)

    for dev, fl in by_dev.items():
        prof = baseline.get(dev) if baseline else None
        allowed = (prof["ports"] | DEFAULT_ALLOWED_PORTS) if prof else DEFAULT_ALLOWED_PORTS

        # 1. Known-bad destinations and ports
        seen_bad = defaultdict(list)
        for f in fl:
            if f["dst_ip"] in KNOWN_BAD_IPS:
                seen_bad[("ip", f["dst_ip"])].append(f)
            if f["dst_port"] in SUSPICIOUS_PORTS:
                seen_bad[("port", f["dst_port"])].append(f)
        for (kind, val), fs in seen_bad.items():
            if kind == "ip":
                findings.append(_finding(dev, "known_bad_ip", "critical", "Contact with known-bad IP",
                    f"{len(fs)} flow(s) to threat-intel listed address {val}", "T1071 Application Layer Protocol (C2)",
                    {"dst_ip": val, "flows": len(fs)}, fs[0]["ts"], fs[-1]["ts"]))
            else:
                findings.append(_finding(dev, "suspicious_port", "high", f"Suspicious port {val} ({SUSPICIOUS_PORTS[val]})",
                    f"{len(fs)} flow(s) to port {val}; destinations: {', '.join(sorted({x['dst_ip'] for x in fs})[:5])}",
                    "T1571 Non-Standard Port", {"dst_port": val, "flows": len(fs)}, fs[0]["ts"], fs[-1]["ts"]))

        # 2. Never-before-seen / off-profile ports (skip ones already flagged above)
        odd = defaultdict(list)
        for f in fl:
            if f["dst_port"] not in allowed and f["dst_port"] not in SUSPICIOUS_PORTS:
                odd[f["dst_port"]].append(f)
        for port, fs in odd.items():
            findings.append(_finding(dev, "unusual_port", "medium", f"Unusual destination port {port}",
                f"{len(fs)} flow(s) on port {port} outside the device's {'baseline' if prof else 'expected'} profile",
                "T1571 Non-Standard Port", {"dst_port": port, "flows": len(fs)}, fs[0]["ts"], fs[-1]["ts"]))

        # 3. New external destinations vs baseline
        if prof:
            new = defaultdict(list)
            for f in fl:
                if f["dst_ip"] not in prof["dsts"] and not _is_private(f["dst_ip"]):
                    new[f["dst_ip"]].append(f)
            for ip, fs in new.items():
                findings.append(_finding(dev, "new_external_dst", "medium", f"New external destination {ip}",
                    f"{len(fs)} flow(s) to an address never seen in the baseline", "T1071 Application Layer Protocol",
                    {"dst_ip": ip, "flows": len(fs)}, fs[0]["ts"], fs[-1]["ts"]))

        # 4. Beaconing: regular timing (and similar size) to one dst:port
        groups = defaultdict(list)
        for f in fl:
            groups[(f["dst_ip"], f["dst_port"])].append(f)
        for (ip, port), fs in groups.items():
            if len(fs) < BEACON_MIN_EVENTS:
                continue
            # Legit services (NTP, RTSP, cloud heartbeat) are periodic too. Only treat timing as a
            # beacon when the peer is outside the device's baseline, or -- with no baseline -- when
            # the port isn't a well-known service port for this device class.
            if prof is not None:
                if (ip, port) in prof["pairs"]:
                    continue
            elif port in DEFAULT_ALLOWED_PORTS and ip not in KNOWN_BAD_IPS:
                continue
            ts = [f["ts"] for f in fs]
            gaps = [b - a for a, b in zip(ts, ts[1:]) if b - a > 0]
            if len(gaps) < BEACON_MIN_EVENTS - 1:
                continue
            cv, bcv = _cv(gaps), _cv([float(f["bytes_out"]) for f in fs])
            if cv <= BEACON_MAX_CV and bcv <= BEACON_MAX_BYTES_CV and statistics.fmean(gaps) >= 1:
                sev = "high"
                findings.append(_finding(dev, "beaconing", sev, f"Periodic beaconing to {ip}:{port}",
                    f"{len(fs)} flows, mean interval {statistics.fmean(gaps):.1f}s (jitter CV {cv:.2f}), "
                    f"avg {statistics.fmean(f['bytes_out'] for f in fs):.0f} B/flow",
                    "T1071 / T1029 Scheduled Transfer",
                    {"dst_ip": ip, "dst_port": port, "flows": len(fs), "interval_s": round(statistics.fmean(gaps), 2),
                     "jitter_cv": round(cv, 3)}, ts[0], ts[-1]))

        # 5. Scan burst: many distinct targets inside a short window
        for key, label in (("dst_ip", "hosts"), ("dst_port", "ports")):
            lo, hit = 0, None
            for hi in range(len(fl)):
                while fl[hi]["ts"] - fl[lo]["ts"] > SCAN_WINDOW_S:
                    lo += 1
                win = fl[lo:hi + 1]
                if len({x[key] for x in win}) >= SCAN_MIN_TARGETS:
                    hit = (win[0]["ts"], win[-1]["ts"], len({x[key] for x in win}))
                    break
            if hit:
                findings.append(_finding(dev, f"scan_{label}", "high", f"Scan-like burst across {hit[2]} distinct {label}",
                    f"{hit[2]} distinct {label} within {SCAN_WINDOW_S}s window",
                    "T1046 Network Service Discovery" if label == "ports" else "T1018 Remote System Discovery",
                    {"distinct": hit[2], "window_s": SCAN_WINDOW_S}, hit[0], hit[1]))

        # 6. Exfiltration: large outbound volume to a non-private address, or outlier vs baseline
        vol = defaultdict(int)
        for f in fl:
            if not _is_private(f["dst_ip"]):
                vol[f["dst_ip"]] += f["bytes_out"]
        for ip, total in vol.items():
            if total >= EXFIL_ABS_BYTES:
                findings.append(_finding(dev, "exfil_volume", "high", f"Large outbound transfer to {ip}",
                    f"{total/1e6:.1f} MB sent to external address", "T1041 Exfiltration Over C2 Channel",
                    {"dst_ip": ip, "bytes_out": total}))
        if prof and prof["std_bytes"] > 0:
            thr = prof["mean_bytes"] + EXFIL_SIGMA * prof["std_bytes"]
            big = [f for f in fl if f["bytes_out"] > thr and f["bytes_out"] > 100_000]
            if big:
                findings.append(_finding(dev, "volume_outlier", "medium", "Flow size far above baseline",
                    f"{len(big)} flow(s) exceed baseline mean+{EXFIL_SIGMA:.0f}σ ({thr:,.0f} B); max {max(f['bytes_out'] for f in big):,} B",
                    "T1030 Data Transfer Size Limits", {"flows": len(big)}, big[0]["ts"], big[-1]["ts"]))

        # 7. Cleartext remote-admin on the device itself being contacted outbound
        # (covered by suspicious_port for 23/2323)

    # Dedupe: a beaconing flow to a flagged-bad dst needn't also raise 'unusual_port'
    bad_ports = {(f["device"], f["evidence"].get("dst_port")) for f in findings if f["rule"] in ("suspicious_port", "beaconing")}
    findings = [f for f in findings if not (f["rule"] == "unusual_port" and (f["device"], f["evidence"].get("dst_port")) in bad_ports)]

    devices = []
    for dev, fl in by_dev.items():
        fs = [f for f in findings if f["device"] == dev]
        score = min(100, sum(SEVERITY_SCORE[f["severity"]] for f in fs))
        status = "compromised" if score >= 50 else "suspicious" if score >= 10 else "clean"
        devices.append({"device": dev, "flows": len(fl), "bytes_out": sum(f["bytes_out"] for f in fl),
                        "src_ips": sorted({f["src_ip"] for f in fl}), "score": score, "status": status,
                        "findings": len(fs)})
    devices.sort(key=lambda d: -d["score"])
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: (order[f["severity"]], f["device"]))
    return {"summary": {"flows": len(flows), "devices": len(devices), "findings": len(findings),
                        "compromised": sum(d["status"] == "compromised" for d in devices),
                        "suspicious": sum(d["status"] == "suspicious" for d in devices),
                        "with_baseline": baseline is not None},
            "devices": devices, "findings": findings}
