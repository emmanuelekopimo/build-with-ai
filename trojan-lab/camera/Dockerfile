FROM python:3.12-alpine
RUN pip install --no-cache-dir flask pillow
WORKDIR /app
COPY camera/camera.py /app/
COPY common/ /app/common/
ENV PYTHONUNBUFFERED=1
CMD ["python", "camera.py"]
