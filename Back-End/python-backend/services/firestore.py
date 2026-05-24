import json
import base64
import threading
import firebase_admin
from firebase_admin import credentials, firestore
from core.settings import get_settings

_db = None
_lock = threading.Lock()


def get_db():
    global _db
    if _db is not None:
        return _db
    with _lock:
        if _db is not None:  # double-checked locking
            return _db

        if not firebase_admin._apps:
            s = get_settings()
            cred_json_b64 = s.google_application_credentials_json
            if cred_json_b64:
                try:
                    cred_dict = json.loads(base64.b64decode(cred_json_b64).decode())
                except Exception:
                    cred_dict = json.loads(cred_json_b64)
                cred = credentials.Certificate(cred_dict)
            else:
                cred = credentials.Certificate(s.google_application_credentials)

            options = {"projectId": s.firestore_project_id} if s.firestore_project_id else {}
            firebase_admin.initialize_app(cred, options)

        _db = firestore.client()
    return _db
