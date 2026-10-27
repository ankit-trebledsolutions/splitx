"""The two models behind the service, through OpenCV's own face APIs.

Detector:   YuNet  (opencv_zoo face_detection_yunet_2023mar, MIT licence)
Recogniser: SFace  (opencv_zoo face_recognition_sface_2021dec, Apache-2.0)

Both are small, run on the CPU through OpenCV's DNN module, and may be used in
a commercial app (InsightFace's better-known models are research-only, which
is why they are not here). SFace gives a 128-number fingerprint; OpenCV's own
guidance is that two faces are the same person at a cosine similarity of
about 0.363 or more. The API's FACE_MATCH_THRESHOLD is where that is tuned.

Images are BGR uint8 arrays, height x width x 3, as OpenCV wants them.
"""
import cv2
import numpy as np

MODEL_NAME = "sface-2021dec"
EMBEDDING_DIM = 128
# YuNet's confidence that a box is a face, and the overlap at which two boxes
# are the same face.
SCORE_THRESHOLD = 0.6
NMS_THRESHOLD = 0.3
TOP_K = 5000


class FaceEngine:
    def __init__(self, detector_path, recognizer_path, threads=2):
        cv2.setNumThreads(threads)
        self.detector = cv2.FaceDetectorYN.create(
            detector_path, "", (320, 320), SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K
        )
        self.recognizer = cv2.FaceRecognizerSF.create(recognizer_path, "")

    def detect(self, img, size):
        """Faces in a BGR image, as YuNet reports them: rows of
        [x, y, w, h, five landmark x/y pairs, score], in the image's own pixels.

        The detector looks at the image shrunk so its long side is `size`
        (never enlarged): faster, and small background faces drop out.
        Returns the rows and the shrink factor used.
        """
        height, width = img.shape[:2]
        scale = min(1.0, size / max(height, width))
        if scale < 1.0:
            working = cv2.resize(
                img, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA
            )
        else:
            working = img
        self.detector.setInputSize((working.shape[1], working.shape[0]))
        _, faces = self.detector.detect(working)
        if faces is None or len(faces) == 0:
            return np.zeros((0, 15), dtype=np.float32), scale
        faces = np.asarray(faces, dtype=np.float32)
        faces[:, :14] /= scale
        return faces, scale

    def embed(self, img, face):
        """Unit-length fingerprint of the face in `face` (one detect() row):
        the face is cut out and straightened on its landmarks first."""
        crop = self.recognizer.alignCrop(img, face)
        feature = np.asarray(self.recognizer.feature(crop), dtype=np.float32).flatten()
        norm = np.linalg.norm(feature)
        return feature / norm if norm > 0 else feature
