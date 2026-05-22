import os
import json
import base64
import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def get_db():
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        cred_json_b64 = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        if cred_json_b64:
            try:
                cred_dict = json.loads(base64.b64decode(cred_json_b64).decode())
            except Exception:
                cred_dict = json.loads(cred_json_b64)
            cred = credentials.Certificate(cred_dict)
        else:
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./serviceAccountKey.json")
            cred = credentials.Certificate(cred_path)

        project_id = os.getenv("FIRESTORE_PROJECT_ID")
        options = {"projectId": project_id} if project_id else {}
        firebase_admin.initialize_app(cred, options)

    _db = firestore.client()
    return _db
