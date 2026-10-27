# Splix face service

The server-side half of the gallery's **Face Scan**. One job: given a photo,
say where the faces are and give each one a fingerprint, a vector of numbers
that is close for two pictures of the same person and far for two different
people. Everything else (what is stored, who may search, what counts as a
match) lives in the Node API under `backend/`, which is the only thing that
calls this. The service keeps nothing: a photo is read, answered and forgotten.

## Models

| Role | Model | Where from | Licence |
| --- | --- | --- | --- |
| Find faces | YuNet (`face_detection_yunet_2023mar.onnx`, 230 KB) | [OpenCV model zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) | MIT |
| Fingerprint a face | SFace (`face_recognition_sface_2021dec.onnx`, 37 MB) | [OpenCV model zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) | Apache-2.0 |

Both run on the CPU through OpenCV's own DNN module, so the only heavy
dependency is `opencv-python-headless`. They were chosen over InsightFace's
better-known models because those are licensed for non-commercial research
only. `download_models.py` fetches them and checks each against a known
SHA-256; the Docker build runs it, so the image needs no network at run time.

The fingerprint is 128 numbers scaled to unit length. OpenCV's own guidance
for SFace is that two faces are the same person at a cosine similarity of
about 0.363 or more; the API's `FACE_MATCH_THRESHOLD` is where that is tuned
(it defaults a little higher, for fewer wrong matches).

## API

```
POST /faces?det=640&limit=20     multipart/form-data, file field `file`
GET  /health
```

The answer to `POST /faces`:

```json
{
  "model": "sface-2021dec", "dim": 128,
  "width": 3000, "height": 2000,
  "faces": [
    { "box": [0.41, 0.18, 0.57, 0.46], "score": 0.93, "embedding": [128 floats] }
  ]
}
```

- `width`/`height` are the photo's size once turned the way the phone meant
  (EXIF orientation is applied before anything else).
- `box` is `x1, y1, x2, y2` as fractions of that width and height. Faces come
  largest first.
- `det` is the long side the detector works at (320..1280). Bigger finds
  smaller faces and costs more: 640 suits a selfie, 960 a group photo (the
  API sends 640 for a scan and 960 for an upload). `limit` caps the faces
  returned, keeping the largest.
- Faces smaller than `FACE_MIN_FACE_PX` (20) in the detector's working frame
  are left out: too little to fingerprint, and mostly the crowd behind.
- Errors: `400` empty upload, `413` over `FACE_MAX_UPLOAD_BYTES` (15 MB),
  `415` not an image Pillow can read (HEIC is not, see below).

One photo is processed at a time; a second request waits. That is on purpose:
the API queues uploads one by one, and two scans arriving together should not
double the memory.

## Running it

In production it is the `face` service in `docker-compose.yml`, built from this
folder and reached by the API as `http://face:8000` (no port is published).
The first build downloads the models and takes a few minutes.

Locally, with Python 3.11:

```bash
cd face-service
python -m venv .venv
.venv/Scripts/activate            # Windows; on Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python download_models.py         # once; puts the two files in ./models
uvicorn app:app --port 8000
```

Then point the API at it with `FACE_SERVICE_URL=http://127.0.0.1:8000` and
try it:

```bash
curl -F "file=@photo.jpg" "http://127.0.0.1:8000/faces?det=960"
```

Without Python at all, `node backend/scripts/fake-face.js` stands in for the
service in development (it cannot see faces; see the script for what it answers).

Environment: `MODEL_DIR` (where the models are; `./models` by default,
`/models` in the image), `FACE_THREADS` (OpenCV threads, 2; keep at or under
the container's CPU limit), `FACE_MAX_SIDE` (photos are shrunk to this long
side first, 3000), `FACE_MAX_UPLOAD_BYTES`, `FACE_MIN_FACE_PX`.

## Known limits

- HEIC photos cannot be read (Pillow needs a plug-in for them); the API marks
  such a photo `failed` after three tries and moves on. Phones send JPEG when
  the app picks with a quality setting, as Splix does.
- Small, turned-away, masked or blurred faces, heavy filters and children
  who have grown are where matching gets unreliable. SFace is a compact
  model; a stronger commercially licensed recogniser can replace it behind
  the same API (the answer names its `model` and `dim`, and the API only
  compares fingerprints made by the same model).
