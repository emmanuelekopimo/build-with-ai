# Common tasks. Run `make help`.
PY ?= python3

.PHONY: help install run test sample-data lab-up lab-infect lab-down screenshots pdf docs

help:            ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'

install:         ## install detector, test and docs dependencies
	$(PY) -m pip install -r trojan-lab/detector/requirements.txt pytest -r docs/build/requirements.txt

run:             ## start the detector UI on http://localhost:8080 (no Docker)
	cd trojan-lab/detector && LAB_DATA_DIR=$${LAB_DATA_DIR:-/tmp/lab} $(PY) app.py

test:            ## run the unit tests
	$(PY) -m pytest -q trojan-lab/tests

sample-data:     ## regenerate the sample flow CSVs
	$(PY) trojan-lab/detector/flowgen.py --out trojan-lab/sample_data

lab-up:          ## start the Docker lab (cameras, RTSP, C2, detector)
	cd trojan-lab && docker compose up --build -d

lab-infect:      ## start the harmless trojan simulator on cam-garage
	cd trojan-lab && docker compose --profile trojan up -d trojan

lab-down:        ## stop the lab and remove its volume
	cd trojan-lab && docker compose --profile trojan down -v

screenshots:     ## retake annotated screenshots with Playwright
	$(PY) docs/build/capture_screenshots.py

pdf:             ## rebuild docs/IoT-Trojan-Detector-Documentation.pdf from HTML
	$(PY) docs/build/build_pdf.py

docs: screenshots pdf  ## screenshots + PDF
