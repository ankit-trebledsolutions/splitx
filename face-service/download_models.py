"""Fetches the two model files the service uses, from the OpenCV model zoo.

    YuNet  face_detection_yunet_2023mar.onnx     (230 KB, MIT)
    SFace  face_recognition_sface_2021dec.onnx   (37 MB, Apache-2.0)

Each file is checked against a known SHA-256, so a changed or tampered
download fails the build instead of silently running a different model. If
the zoo updates a file in place, the hash here must be updated on purpose.

    python download_models.py [target_dir]     (default: ./models)

Run at image build time (Dockerfile) and once by hand for a local checkout.
"""
import hashlib
import os
import sys
import urllib.request

ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        f"{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        f"{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}


def sha256_of(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "splix-face-service/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main(target):
    os.makedirs(target, exist_ok=True)
    for name, (url, digest) in MODELS.items():
        path = os.path.join(target, name)
        if os.path.exists(path):
            with open(path, "rb") as existing:
                if sha256_of(existing.read()) == digest:
                    print(f"{name}: already in {target}")
                    continue
        print(f"{name}: downloading {url}")
        data = fetch(url)
        if sha256_of(data) != digest:
            raise SystemExit(f"{name} does not match its known hash; refusing to use it")
        with open(path, "wb") as out:
            out.write(data)
        print(f"{name}: saved ({len(data) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
