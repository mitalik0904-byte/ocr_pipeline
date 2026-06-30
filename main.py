import os, json, asyncio
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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
