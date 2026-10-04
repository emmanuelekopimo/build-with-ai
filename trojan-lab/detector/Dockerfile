FROM python:3.12-alpine
WORKDIR /app
COPY detector/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector/ /app/
COPY sample_data/ /sample_data/
ENV SAMPLE_DIR=/sample_data LAB_DATA_DIR=/data
EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "app:app"]
