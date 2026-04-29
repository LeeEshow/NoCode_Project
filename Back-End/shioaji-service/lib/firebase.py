from google.cloud import firestore
import os

_db: firestore.Client | None = None


def get_db() -> firestore.Client:
    global _db
    if _db is None:
        project_id = os.environ.get("FIRESTORE_PROJECT_ID")
        _db = firestore.Client(project=project_id)
    return _db
