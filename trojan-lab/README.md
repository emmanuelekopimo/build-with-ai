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

## Run everything without Docker (Windows, macOS, Linux)
```bash
python trojan-lab/local_lab.py          # Windows: py trojan-lab\local_lab.py
```
Starts the fake C2, two simulated **live cameras**, and the detector. Open <http://localhost:8080> (detector) and
<http://localhost:8081> / <http://localhost:8082> (live view, login `admin` / `admin`). Wait about a minute, click
**Freeze live capture as baseline**, press Enter in the terminal to infect `cam-garage`, then **Analyse live lab capture** and **Quarantine**.
Ctrl+C stops everything and removes the simulated persistence files. Everything binds to `127.0.0.1` and the simulated scan targets
`127.0.0.x`, so nothing leaves your machine. Needs `pip install flask pillow`.

Windows notes: `flowlog.py` uses a `msvcrt` lock on Windows (covered by a simulated test, but not run on real Windows in CI), data goes to
`%TEMP%\trojan-lab-data`, and persistence files go to `%TEMP%`. Windows Firewall may ask once to allow Python on localhost.

### Running pieces by hand
```bash
export COMMON_DIR=$PWD/trojan-lab/common LAB_DATA_DIR=/tmp/lab FLOW_LOG=/tmp/lab/flows.csv
export DEVICE=cam-garage C2_HOST=127.0.0.1 C2_PORT=4444 BEACON_INTERVAL=5 SCAN_PREFIX=127.0.0.   # SCAN_PREFIX keeps the scan on loopback
python3 trojan-lab/c2/c2.py &                      # fake C2
python3 trojan-lab/trojan_sim/kworker_upd.py       # simulator
mkdir -p /tmp/lab/quarantine && touch /tmp/lab/quarantine/cam-garage    # contain it: files removed, process exits
```
PowerShell: `$env:COMMON_DIR="$PWD\trojan-lab\common"; $env:SCAN_PREFIX="127.0.0."` and so on, then `py trojan-lab\c2\c2.py`.
The simulator keeps its "persistence" files under the temp directory by default, so it never touches your real cron configuration;
inside Docker, `docker-compose.yml` sets the realistic `/etc/cron.d/kworker` path. It checks for the quarantine marker between beacons.
**Do not run the simulator on a network where `10.50.0.20-31` are real hosts without setting `SCAN_PREFIX`.**

## Simulating a live camera (no physical camera)
| Option | What you get | How |
|---|---|---|
| Built-in MJPEG camera (this repo) | Live moving picture in any browser or VLC, with login, snapshots and realistic flows. No ffmpeg or Docker | `python trojan-lab/local_lab.py`, then <http://localhost:8081> (stream: `/stream`) |
| Docker RTSP loop (this repo) | A real RTSP stream, like most IP cameras | `make lab-up`, then `rtsp://localhost:8554/cam` in VLC |
| Any video file as an RTSP camera | Your own footage on loop | Run [MediaMTX](https://github.com/bluenviron/mediamtx), then `ffmpeg -re -stream_loop -1 -i clip.mp4 -c copy -f rtsp rtsp://localhost:8554/cam` |
| Your laptop webcam as a network camera | Real live video | OBS Studio or ffmpeg publishing to MediaMTX, or the "IP Webcam" phone app, which exposes an HTTP/RTSP stream |
| Real cheap hardware | A physical device | ESP32-CAM (a few dollars) or a Raspberry Pi with a camera module |
The detector only needs flow records (who talked to whom), so for detection demos any of these is equivalent; the video is for realism.

## Hosting the detector online
Only the **detector** (Flask app) is a good fit for a web host; the multi-container lab with an internal network belongs on your own machine or a VM
running `docker compose`. The detector image reads `$PORT`; set `WEB_CONCURRENCY=1` so the in-memory baseline is shared between requests.
| Host | Notes |
|---|---|
| Render | Deploy from GitHub using `trojan-lab/detector/Dockerfile` (context `trojan-lab`); free instances sleep when idle |
| Railway / Fly.io | Docker deploys; small usage-based or trial allowances |
| Hugging Face Spaces | Docker Space; handy for demos and a shareable link |
| PythonAnywhere | Flask-friendly without Docker; free tier is limited |
| Google Cloud Run / Azure App Service | Production-style container hosting |
Free tiers change often, so check each provider's current terms. **Add authentication (or keep the site private) before exposing it:**
the app has no login and has an upload endpoint and a quarantine endpoint.

## Limits
Flow telemetry in the lab comes from the simulators (a real deployment would use Zeek/Suricata or the
router's NetFlow). Quarantine in the lab is a marker file; on real networks wire `/api/quarantine` to a
firewall/NAC. The camera admin page's `admin/admin` login is deliberately weak, for demo purposes only.
