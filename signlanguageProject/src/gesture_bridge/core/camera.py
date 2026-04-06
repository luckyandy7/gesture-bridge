from __future__ import annotations

from dataclasses import dataclass
import sys
import time


@dataclass(frozen=True)
class CameraProbeResult:
    camera_index: int
    backend_label: str
    opened: bool
    readable: bool
    attempts: int


class WebcamStream:
    def __init__(
        self,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        mirror: bool = True,
        backend: str = "auto",
        warmup_frames: int = 12,
        read_retries: int = 20,
        retry_delay_sec: float = 0.1,
        scan_indices: tuple[int, ...] = (0, 1, 2),
    ) -> None:
        try:
            import cv2
        except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
            raise RuntimeError(
                "OpenCV is required for camera capture. Install with `pip install -e \".[vision]\"`."
            ) from exc

        self._cv2 = cv2
        self.mirror = mirror
        self.read_retries = max(1, read_retries)
        self.retry_delay_sec = max(0.01, retry_delay_sec)
        self.camera_index = camera_index
        self.backend = backend
        self._capture, self.backend_label, self.camera_index = self._open_capture(
            camera_index=camera_index,
            width=width,
            height=height,
            backend=backend,
            warmup_frames=warmup_frames,
            scan_indices=scan_indices,
        )

    def _open_capture(
        self,
        *,
        camera_index: int,
        width: int,
        height: int,
        backend: str,
        warmup_frames: int,
        scan_indices: tuple[int, ...],
    ):
        attempts: list[str] = []

        for candidate_index in self._candidate_indices(camera_index, scan_indices):
            for backend_label, backend_value in self._candidate_backends(backend):
                capture = (
                    self._cv2.VideoCapture(candidate_index)
                    if backend_value is None
                    else self._cv2.VideoCapture(candidate_index, backend_value)
                )
                capture.set(self._cv2.CAP_PROP_FRAME_WIDTH, width)
                capture.set(self._cv2.CAP_PROP_FRAME_HEIGHT, height)

                if not capture.isOpened():
                    attempts.append(f"{candidate_index}:{backend_label}=open-failed")
                    capture.release()
                    continue

                readable = self._warmup(capture, warmup_frames)
                if readable:
                    return capture, backend_label, candidate_index

                attempts.append(f"{candidate_index}:{backend_label}=read-failed")
                capture.release()

        tried = ", ".join(attempts) if attempts else backend
        raise RuntimeError(
            f"Could not open a readable webcam stream. Tried: {tried}. "
            "Check camera permissions and make sure no other app is using the webcam."
        )

    def _candidate_backends(self, backend: str) -> list[tuple[str, int | None]]:
        candidates: list[tuple[str, int | None]] = []

        if backend == "default":
            return [("default", None)]

        if backend == "avfoundation":
            return [("avfoundation", getattr(self._cv2, "CAP_AVFOUNDATION", None))]

        if backend == "auto":
            if sys.platform == "darwin":
                avfoundation = getattr(self._cv2, "CAP_AVFOUNDATION", None)
                if avfoundation is not None:
                    candidates.append(("avfoundation", avfoundation))
            candidates.append(("default", None))
            return candidates

        return [(backend, None)]

    def _candidate_indices(self, camera_index: int, scan_indices: tuple[int, ...]) -> list[int]:
        ordered: list[int] = [camera_index]
        for candidate in scan_indices:
            if candidate not in ordered:
                ordered.append(candidate)
        return ordered

    def _warmup(self, capture, warmup_frames: int) -> bool:
        for _ in range(max(0, warmup_frames)):
            ok, frame = capture.read()
            if ok and frame is not None:
                return True
            time.sleep(self.retry_delay_sec)
        return False

    def read(self) -> tuple[object, int]:
        last_ok = False
        last_frame = None

        for _ in range(self.read_retries):
            ok, frame = self._capture.read()
            if ok and frame is not None:
                last_ok = True
                last_frame = frame
                break
            time.sleep(self.retry_delay_sec)

        if not last_ok or last_frame is None:
            raise RuntimeError(
                "Failed to read a frame from the webcam. "
                f"Camera index={self.camera_index}, backend={self.backend_label}. "
                "Close apps like FaceTime, Zoom, or Photo Booth, then try again. "
                "If it still fails, rerun with `--camera-backend default` or `--camera-backend avfoundation`."
            )

        if self.mirror:
            last_frame = self._cv2.flip(last_frame, 1)

        timestamp_ms = time.monotonic_ns() // 1_000_000
        return last_frame, int(timestamp_ms)

    def close(self) -> None:
        self._capture.release()

    def __enter__(self) -> "WebcamStream":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


def probe_cameras(
    camera_indices: tuple[int, ...] = (0, 1, 2),
    width: int = 1280,
    height: int = 720,
    backend: str = "auto",
) -> list[CameraProbeResult]:
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "OpenCV is required for camera probing. Install with `pip install -e \".[vision]\"`."
        ) from exc

    stream = WebcamStream.__new__(WebcamStream)
    stream._cv2 = cv2
    stream.retry_delay_sec = 0.1
    results: list[CameraProbeResult] = []

    for candidate_index in camera_indices:
        for backend_label, backend_value in stream._candidate_backends(backend):
            capture = (
                cv2.VideoCapture(candidate_index)
                if backend_value is None
                else cv2.VideoCapture(candidate_index, backend_value)
            )
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

            opened = bool(capture.isOpened())
            readable = False
            attempts = 0

            if opened:
                for _ in range(10):
                    attempts += 1
                    ok, frame = capture.read()
                    if ok and frame is not None:
                        readable = True
                        break
                    time.sleep(0.1)

            capture.release()
            results.append(
                CameraProbeResult(
                    camera_index=candidate_index,
                    backend_label=backend_label,
                    opened=opened,
                    readable=readable,
                    attempts=attempts,
                )
            )

    return results
