FROM python:3.12-alpine
COPY trojan_sim/kworker_upd.py /usr/local/bin/kworker_upd.py
COPY common/ /app/common/
ENV PYTHONUNBUFFERED=1
CMD ["python", "/usr/local/bin/kworker_upd.py"]
