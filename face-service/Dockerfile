# Splix face service: finds the faces in a photo and returns a fingerprint for
# each (see app.py). Built and run by docker-compose.yml at the project root.
# Only the API talks to it, as http://face:8000; no port is published.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MODEL_DIR=/models

# OpenCV's headless wheel still links glib.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a code-only change reuses this layer.
COPY requirements.txt .
RUN pip install -r requirements.txt

# The model files (37 MB) are fetched once, at build time, and checked against
# known hashes. Their own layer: a code change below does not fetch them again.
COPY download_models.py .
RUN python download_models.py "$MODEL_DIR"

COPY app.py engine.py ./

RUN useradd --create-home face && chown -R face /app
USER face

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
