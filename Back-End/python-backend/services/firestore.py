import base64
import json
import os
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

# Firestore 連線單例 — 整個服務共用同一個 client
# 與 Node.js finance-backend 共用同一個 Firestore project
#
# 使用 Lazy Proxy 延遲初始化：import 本模組不觸發 Firebase 初始化，
# 直到第一次實際呼叫 db.collection(...) 時才建立連線。
# 好處：測試環境可 import 而不需要 serviceAccountKey.json。


def _init_app() -> None:
    cred_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if cred_json:
        # Azure 部署：環境變數存放 base64 編碼的 JSON
        try:
            decoded = base64.b64decode(cred_json).decode("utf-8")
        except Exception:
            decoded = cred_json
        cred = credentials.Certificate(json.loads(decoded))
    else:
        # 本機開發：使用 serviceAccountKey.json 檔案路徑
        key_path = os.getenv(
            "GOOGLE_APPLICATION_CREDENTIALS", "./serviceAccountKey.json"
        )
        cred = credentials.Certificate(key_path)

    firebase_admin.initialize_app(cred)


class _LazyFirestoreClient:
    """Firestore client proxy：第一次屬性存取時才初始化 Firebase。"""

    _client: Any = None

    def _get_client(self):
        if self._client is None:
            if not firebase_admin._apps:
                _init_app()
            self._client = firestore.client()
        return self._client

    def __getattr__(self, name: str):
        return getattr(self._get_client(), name)

    # 讓 isinstance(db, _LazyFirestoreClient) 仍可用於型別檢查
    def __repr__(self):
        return f"<LazyFirestoreClient initialized={self._client is not None}>"


db = _LazyFirestoreClient()
