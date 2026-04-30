import sys
from pathlib import Path

# 讓 src/ 內的 shioaji_api 套件不需 uv install 即可被 import
sys.path.insert(0, str(Path(__file__).parent / "src"))

from shioaji_api.main import app  # noqa: E402

__all__ = ["app"]
