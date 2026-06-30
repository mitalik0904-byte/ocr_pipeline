import os, json, asyncio, csv, uuid
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

import aiofiles
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from loguru import logger

from utils.pipeline import OCRPipeline

app = FastAPI(title="Multi-Agent OCR Auditing Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOME       = Path.home()
UPLOAD_DIR = HOME / "ocr_pipeline" / "uploads"
RESULTS_DIR = HOME / "ocr_pipeline" / "results"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

pipeline: Optional[OCRPipeline] = None
active_ws: list[WebSocket] = []


def get_pipeline(model: str = "llama3") -> OCRPipeline:
    global pipeline
    if pipeline is None:
        pipeline = OCRPipeline(model=model)
    return pipeline


async def broadcast(msg: dict):
    dead = []
    for ws in active_ws:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in active_ws:
            active_ws.remove(ws)


@app.websocket("/ws/progress")
async def ws_progress(websocket: WebSocket):
    await websocket.accept()
    active_ws.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_ws:
            active_ws.remove(websocket)


ALLOWED = {".pdf",".png",".jpg",".jpeg",".tiff",".tif",".bmp",".webp"}


@app.post("/api/process")
async def process_document(
    file: UploadFile = File(...),
    language: str    = Form(default="auto"),
    model: str       = Form(default="llama3"),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    safe_name = file.filename.replace(" ", "_")
    tmp_path  = UPLOAD_DIR / safe_name

    try:
        content = await file.read()
        async with aiofiles.open(tmp_path, "wb") as f:
            await f.write(content)

        await broadcast({"step": "preprocessing", "pct": 10, "msg": "Starting..."})

        loop = asyncio.get_event_loop()
        pl   = get_pipeline(model)

        def progress_cb(step: str, pct: int):
            asyncio.run_coroutine_threadsafe(
                broadcast({"step": step, "pct": pct, "msg": f"Agent: {step}"}),
                loop
            )

        result = await loop.run_in_executor(
            None, lambda: pl.run(str(tmp_path), language, progress_cb)
        )

        await broadcast({"step": "done", "pct": 100, "msg": "Complete!"})

        if tmp_path.exists():
            tmp_path.unlink()

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"/api/process error: {e}")
        if tmp_path.exists():
            tmp_path.unlink()
        import traceback
        raise HTTPException(500, f"{e}\n{traceback.format_exc()}")


class ChatRequest(BaseModel):
    message: str
    history: list = []


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        pl   = get_pipeline()
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None, lambda: pl.chat(req.message, req.history)
        )
        return {"response": resp}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/stats")
async def stats():
    try:
        return get_pipeline().get_stats()
    except Exception as e:
        return {"error": str(e), "total_invoices": 0}


@app.get("/api/health")
async def health():
    return {"status": "ok", "pipeline": "ready"}


@app.get("/")
async def root():
    return {"message": "OCR Audit Pipeline API running", "docs": "/docs"}


# ==================== BATCH PROCESSING ====================

@app.post("/api/batch")
async def batch_upload(files: list[UploadFile]):
    """Upload multiple files for batch processing"""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    batch_id = str(uuid.uuid4())
    batch_dir = RESULTS_DIR / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    pl = get_pipeline()
    
    for idx, file in enumerate(files):
        try:
            logger.info(f"[Batch {batch_id}] Processing file {idx+1}/{len(files)}: {file.filename}")
            
            ext = Path(file.filename).suffix.lower()
            if ext not in ALLOWED:
                results.append({
                    'file_name': file.filename,
                    'error': f'Unsupported format: {ext}',
                    'status': 'failed'
                })
                continue
            
            contents = await file.read()
            img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
            
            if img is None:
                results.append({
                    'file_name': file.filename,
                    'error': 'Failed to decode image',
                    'status': 'failed'
                })
                continue
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, lambda: pl.run_ocr_only(img, language="auto")
            )
            
            result['file_name'] = file.filename
            result['batch_id'] = batch_id
            result['status'] = 'completed'
            result['timestamp'] = datetime.now().isoformat()
            
            results.append(result)
            
            await broadcast({
                "batch_id": batch_id,
                "progress": f"{idx+1}/{len(files)}",
                "current_file": file.filename
            })
            
        except Exception as e:
            logger.error(f"Batch file error {file.filename}: {e}")
            results.append({
                'file_name': file.filename,
                'error': str(e),
                'status': 'failed'
            })
    
    # Save batch results
    batch_json = batch_dir / "results.json"
    with open(batch_json, 'w') as f:
        json.dump(results, f, indent=2)
    
    logger.success(f"Batch {batch_id}: {len(results)} files processed")
    return {
        "batch_id": batch_id,
        "file_count": len(files),
        "results_count": len(results),
        "results": results
    }


@app.get("/api/batch/{batch_id}")
async def get_batch_results(batch_id: str):
    """Retrieve batch processing results"""
    batch_dir = RESULTS_DIR / batch_id
    
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Batch not found")
    
    results_file = batch_dir / "results.json"
    if not results_file.exists():
        raise HTTPException(status_code=404, detail="Results not found")
    
    with open(results_file, 'r') as f:
        results = json.load(f)
    
    return {"batch_id": batch_id, "results": results}


@app.post("/api/export/{batch_id}")
async def export_batch_csv(batch_id: str):
    """Export batch results as CSV"""
    batch_dir = RESULTS_DIR / batch_id
    
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Batch not found")
    
    results_file = batch_dir / "results.json"
    if not results_file.exists():
        raise HTTPException(status_code=404, detail="Results not found")
    
    with open(results_file, 'r') as f:
        results = json.load(f)
    
    csv_file = batch_dir / "results.csv"
    
    if results:
        keys = set()
        for r in results:
            if isinstance(r, dict):
                keys.update(r.keys())
        
        with open(csv_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=sorted(keys))
            writer.writeheader()
            for r in results:
                if isinstance(r, dict):
                    writer.writerow(r)
    
    return FileResponse(csv_file, filename=f"batch_{batch_id}.csv")


@app.get("/api/batches")
async def list_batches():
    """List all batch processing results"""
    batches = []
    
    if RESULTS_DIR.exists():
        for batch_dir in RESULTS_DIR.iterdir():
            if batch_dir.is_dir():
                results_file = batch_dir / "results.json"
                if results_file.exists():
                    with open(results_file, 'r') as f:
                        results = json.load(f)
                    batches.append({
                        "batch_id": batch_dir.name,
                        "file_count": len(results),
                        "created_at": batch_dir.stat().st_ctime
                    })
    
    return {"batches": batches}


@app.get("/api/date-range")
async def get_date_range(start_date: str, end_date: str):
    """Get files processed in a date range"""
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format (use ISO format)")
    
    results = []
    
    if RESULTS_DIR.exists():
        for batch_dir in RESULTS_DIR.iterdir():
            if batch_dir.is_dir():
                results_file = batch_dir / "results.json"
                if results_file.exists():
                    with open(results_file, 'r') as f:
                        batch_results = json.load(f)
                    
                    for result in batch_results:
                        if 'timestamp' in result:
                            try:
                                ts = datetime.fromisoformat(result['timestamp'])
                                if start <= ts <= end:
                                    results.append(result)
                            except:
                                pass
    
    return {"date_range": f"{start_date} to {end_date}", "results": results}


@app.get("/api/quick-filter")
async def quick_filter(period: str):
    """Quick filter: TODAY, WEEK, MONTH"""
    now = datetime.now()
    
    if period == "TODAY":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif period == "WEEK":
        start = now - timedelta(days=7)
        end = now
    elif period == "MONTH":
        start = now - timedelta(days=30)
        end = now
    else:
        raise HTTPException(status_code=400, detail="Invalid period (use TODAY, WEEK, or MONTH)")
    
    results = []
    
    if RESULTS_DIR.exists():
        for batch_dir in RESULTS_DIR.iterdir():
            if batch_dir.is_dir():
                results_file = batch_dir / "results.json"
                if results_file.exists():
                    with open(results_file, 'r') as f:
                        batch_results = json.load(f)
                    
                    for result in batch_results:
                        if 'timestamp' in result:
                            try:
                                ts = datetime.fromisoformat(result['timestamp'])
                                if start <= ts <= end:
                                    results.append(result)
                            except:
                                pass
    
    return {"period": period, "count": len(results), "results": results}
