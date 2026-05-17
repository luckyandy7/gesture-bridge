from __future__ import annotations

from pathlib import Path
from urllib.request import Request, urlopen

from gesture_bridge.core.paths import resolve_project_path


USER_AGENT = "gesture-bridge/0.1"


def download_url(url: str, output_path: str | Path, *, timeout: int = 60) -> Path:
    """Download a URL atomically so interrupted runs do not leave partial files."""

    resolved = resolve_project_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temp_path = resolved.with_suffix(f"{resolved.suffix}.download")

    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response, temp_path.open("wb") as file:
            file.write(response.read())
        temp_path.replace(resolved)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    return resolved
