FROM python:3.12-alpine
WORKDIR /app
COPY detector/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector/ /app/
COPY sample_data/ /sample_data/
ENV SAMPLE_DIR=/sample_data LAB_DATA_DIR=/data
EXPOSE 8080
# Hosts such as Render, Railway or Cloud Run inject $PORT. Set WEB_CONCURRENCY=1 so the in-memory baseline is shared by every request.
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-8080} -w ${WEB_CONCURRENCY:-2} app:app"]
