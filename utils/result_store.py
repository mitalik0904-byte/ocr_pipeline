import json
from pathlib import Path
from threading import Lock
from uuid import uuid4


STORE_PATH = Path.home() / "ocr_pipeline" / "results_store" / "documents.json"
LOCK = Lock()


def _read_all() -> list[dict]:
    if not STORE_PATH.exists():
        return []
    try:
        return json.loads(STORE_PATH.read_text())
    except Exception:
        return []


def _write_all(items: list[dict]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(items, indent=2, ensure_ascii=False))


def save_result(result: dict, filename: str) -> dict:
    with LOCK:
        items = _read_all()
        doc = {
            "id": str(uuid4()),
            "filename": filename,
            "invoice_number": result.get("summary", {}).get("invoice_number"),
            "vendor": result.get("summary", {}).get("vendor"),
            "customer": result.get("summary", {}).get("customer"),
            "total_amount": result.get("summary", {}).get("total_amount"),
            "routing": result.get("routing"),
            "confidence_score": result.get("confidence_score", 0),
            "processing_time_seconds": result.get("processing_time_seconds", 0),
            "created_at": result.get("created_at"),
            "result": result,
        }
        items.insert(0, doc)
        _write_all(items[:500])
        return doc


def list_results() -> list[dict]:
    with LOCK:
        return _read_all()


def get_result(doc_id: str) -> dict | None:
    with LOCK:
        for item in _read_all():
            if item.get("id") == doc_id:
                return item
    return None
