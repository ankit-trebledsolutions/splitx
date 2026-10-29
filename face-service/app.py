"""Splix face service.

One job: given a photo, say where the faces are and give each one a
fingerprint (a vector of numbers; the same person photographed twice gives
two vectors that are close). Everything else about Face Scan (what is stored,
who may search, what counts as a match) lives in the Node API, which is the
only thing that calls this. Nothing is kept here: the photo is read, answered
and forgotten.

    POST /faces?det=640&limit=20   multipart form, file field `file`
    GET  /health

The answer to POST /faces:

    {
      "model": "sface-2021dec", "dim": 128,   // what made the fingerprints
      "width": 3000, "height": 2000,          // the photo, the right way up
      "faces": [
        { "box": [x1, y1, x2, y2],            // fractions 0..1 of width/height
          "score": 0.91,                      // how sure the detector is
          "embedding": [128 floats] }         // unit length
      ]                                       // largest face first
    }

`det` is the long side the detector works at (320..1280). Bigger finds
smaller faces and costs more: 640 suits a selfie, 960 a group photo. `limit`
caps the faces returned (largest kept).

Models: YuNet and SFace from the OpenCV model zoo (engine.py), fetched by
download_models.py. Runs on the CPU.
"""
import io
import os
import threading

import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from engine import EMBEDDING_DIM, MODEL_NAME, FaceEngine

MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
# OpenCV threads. Keep it at or under the CPUs the container may use
# (docker-compose.yml), or the runtime fights itself.
THREADS = int(os.environ.get("FACE_THREADS", "2"))
MAX_UPLOAD_BYTES = int(os.environ.get("FACE_MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
# Photos larger than this on their long side are shrunk first: the detector
# works at `det` anyway, and a 50-megapixel file should not cost 150 MB of RAM.
MAX_SIDE = int(os.environ.get("FACE_MAX_SIDE", "3000"))
# Faces smaller than this in the detector's working frame are ignored: too
# little to fingerprint reliably, and mostly the crowd in the background.
MIN_FACE_PX = float(os.environ.get("FACE_MIN_FACE_PX", "20"))

app = FastAPI(title="Splix face service", docs_url=None, redoc_url=None, openapi_url=None)
engine = FaceEngine(
    os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx"),
    os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx"),
    THREADS,
)
# One photo at a time. The API sends photos one by one anyway; this keeps two
# scans arriving together from doubling the memory and halving the speed.
lock = threading.Lock()


def decode(data):
    """The upload as a BGR array, turned the way the phone meant it."""
    try:
        image = Image.open(io.BytesIO(data))
        # Phones record which way up a photo is instead of turning the pixels.
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as err:
        raise HTTPException(status_code=415, detail="not an image this service can read") from err
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    rgb = np.asarray(image)
    return np.ascontiguousarray(rgb[:, :, ::-1])


def clamp(value):
    return float(min(1.0, max(0.0, value)))


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "dim": EMBEDDING_DIM, "threads": THREADS}


# A plain `def`: FastAPI runs it off the event loop, so a slow photo does not
# stall the health check.
@app.post("/faces")
def faces(
    file: UploadFile = File(...),
    det: int = Query(640, ge=320, le=1280),
    limit: int = Query(20, ge=1, le=50),
):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="photo too large")

    img = decode(data)
    height, width = img.shape[:2]

    with lock:
        rows, scale = engine.detect(img, det)
        # Largest first, the too-small left out.
        kept = []
        for row in rows:
            if min(row[2], row[3]) * scale < MIN_FACE_PX:
                continue
            kept.append((float(row[2] * row[3]), row))
        kept.sort(key=lambda item: item[0], reverse=True)
        results = []
        for _area, row in kept[:limit]:
            x, y, w, h, score = float(row[0]), float(row[1]), float(row[2]), float(row[3]), float(row[14])
            embedding = engine.embed(img, row)
            results.append(
                {
                    "box": [clamp(x / width), clamp(y / height), clamp((x + w) / width), clamp((y + h) / height)],
                    "score": round(score, 4),
                    "embedding": [round(float(v), 6) for v in embedding],
                }
            )

    return {
        "model": MODEL_NAME,
        "dim": EMBEDDING_DIM,
        "width": int(width),
        "height": int(height),
        "faces": results,
    }
