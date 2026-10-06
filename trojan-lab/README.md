# IoT Trojan Detection Lab

A safe, repeatable demo: simulated IP cameras, a **harmless** trojan stand-in, a fake C2, and a
detector that analyses **network-flow CSVs** (uploaded or captured live from the lab).

```
 rtsp (MediaMTX+ffmpeg loop)   cam-lobby   cam-garage ◄── trojan sim (shares its netns)
            \                      |            |  beacon :4444
             `----- lab (internal, 10.50.0.0/24, no route out) -----> c2 (fake listener)
                                   |
                              detector UI :8080   (upload CSV · live capture · quarantine)
```

## Why this simulation
Docker containers: free, one command, fully isolated (`internal: true` network), and every run is
identical. The trojan is a script that reproduces the *indicators* (hidden dropper file with the EICAR
string, cron persistence, 15 s C2 beacon, telnet-scan burst, an "exfil" flow record). No payload, and
nothing can leave the lab network.

## Run the demo
```bash
docker compose up --build -d                 # cameras, RTSP, C2, detector
open http://localhost:8080                    # detector UI   (camera admin: :8081, admin/admin; RTSP: rtsp://localhost:8554/cam)
# 1. wait ~1 min, click "Freeze live capture as baseline"
docker compose --profile trojan up -d trojan  # 2. infect cam-garage
# 3. after ~2 min click "Analyse live lab capture" -> cam-garage = compromised
# 4. click Quarantine on cam-garage -> the simulator removes its persistence and stops
docker compose logs -f c2                     # watch beacons arrive, then stop
```

## CSV upload (no Docker needed)
```bash
pip install -r detector/requirements.txt && cd detector && LAB_DATA_DIR=/tmp/lab python app.py   # http://localhost:8080
```
Upload a capture (+ optional baseline). Required columns:

| column | notes |
|---|---|
| `timestamp` | ISO-8601 or epoch seconds |
| `device` | device name/ID (analysis is per device) |
| `src_ip`, `dst_ip`, `dst_port` | |
| `protocol` | TCP / UDP / ... |
| `bytes_out` | bytes sent by the device |

Optional: `bytes_in`, `packets`, `duration`. Aliases such as `ts`, `device_id`, `dport`, `proto`, `bytes`
are accepted. Ready-made files are in `sample_data/` (`baseline_flows.csv`, `clean_flows.csv`,
`infected_flows.csv`); regenerate with `python detector/flowgen.py --out sample_data`.
API: `POST /api/analyze` (multipart `flows`, optional `baseline`) returns JSON.
To feed real traffic, export Zeek `conn.log` / Suricata flows to this CSV shape.

## Detections (mapped to MITRE ATT&CK)
Known-bad IP (T1071) · suspicious ports 23/4444/6667/31337… (T1571) · beaconing = regular intervals
and sizes to a peer outside the baseline (T1029) · scan bursts across hosts/ports (T1018/T1046) ·
large outbound transfer or flow-size outlier (T1041/T1030) · unusual port / new external destination
vs. baseline. Thresholds are constants at the top of `detector/engine.py`.
Without a baseline, periodic traffic on well-known ports (NTP, RTSP, 443…) is not treated as beaconing.

## Tests
`pip install pytest flask && python -m pytest tests`

## Run the simulator without Docker (safe local test)
By default the simulator keeps its "persistence" files under `/tmp` (`/tmp/.kworker-update`, `/tmp/cron.d/kworker`), so it never touches
your real cron configuration. Linux/macOS only (the flow logger uses `fcntl`).
```bash
cd trojan-lab
export COMMON_DIR=$PWD/common LAB_DATA_DIR=/tmp/lab FLOW_LOG=/tmp/lab/flows.csv
export DEVICE=cam-garage C2_HOST=127.0.0.1 C2_PORT=4444 BEACON_INTERVAL=5
mkdir -p /tmp/lab
python3 c2/c2.py &                          # fake C2 (terminal 1)
python3 trojan_sim/kworker_upd.py           # simulator (terminal 2); beacons appear in the C2 output
mkdir -p /tmp/lab/quarantine && touch /tmp/lab/quarantine/cam-garage   # contain it: files removed, process exits
```
The simulator checks for the marker between beacons, so it reacts within one beacon interval (a few seconds longer if it is mid scan-burst).
Inside Docker, `docker-compose.yml` sets `ARTIFACTS` to the realistic `/etc/cron.d/kworker` path, which is harmless in the container.

## Limits
Flow telemetry in the lab comes from the simulators (a real deployment would use Zeek/Suricata or the
router's NetFlow). Quarantine in the lab is a marker file; on real networks wire `/api/quarantine` to a
firewall/NAC. The camera admin page's `admin/admin` login is deliberately weak, for demo purposes only.
