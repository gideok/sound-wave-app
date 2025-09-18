import shutil
import tempfile
from pathlib import Path
from typing import Tuple


def create_temp_dir(prefix: str) -> Path:
    return Path(tempfile.mkdtemp(prefix=prefix))


def write_upload_to(path: Path, file_like) -> None:
    with path.open("wb") as f:
        while True:
            chunk = file_like.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


def safe_rmtree(path: Path) -> None:
    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass


def safe_unlink(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except Exception:
        pass


