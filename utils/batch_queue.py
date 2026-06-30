"""
Asyncio-based background queue for batch processing.
Processes files while API remains responsive.
"""

import asyncio
import uuid
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Callable, Any
from loguru import logger

HOME = Path.home()
DB_PATH = HOME / "ocr_pipeline" / "batch.db"


class BatchQueue:
    def __init__(self, process_fn: Callable):
        self.queue = asyncio.Queue()
        self.process_fn = process_fn  # OCRPipeline.run
        self.worker_task = None
        self.job_status = {}  # In-memory cache
    
    async def add_job(
        self,
        files: list[str],
        job_type: str = "upload",
        date_start: str = None,
        date_end: str = None,
    ) -> str:
        """Queue a batch job, return job_id."""
        job_id = str(uuid.uuid4())
        
        # Create job record
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute('''
            INSERT INTO batch_jobs
            (job_id, created_at, status, total_files, processed_files, failed_files,
             job_type, date_start, date_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (job_id, datetime.now().isoformat(), "queued", len(files), 0, 0,
              job_type, date_start, date_end))
        
        # Create file records
        for filename in files:
            file_id = str(uuid.uuid4())
            c.execute('''
                INSERT INTO batch_files
                (file_id, job_id, filename, status)
                VALUES (?, ?, ?, ?)
            ''', (file_id, job_id, filename, "queued"))
        
        conn.commit()
        conn.close()
        
        # Queue the job
        await self.queue.put((job_id, files))
        self.job_status[job_id] = {"status": "queued", "files": len(files)}
        
        logger.info(f"[BatchQueue] Job {job_id} queued with {len(files)} files")
        return job_id
    
    async def start_worker(self):
        """Start background worker to process queue."""
        if self.worker_task is None:
            self.worker_task = asyncio.create_task(self._worker_loop())
            logger.success("[BatchQueue] Worker started")
    
    async def _worker_loop(self):
        """Process jobs from queue continuously."""
        while True:
            try:
                job_id, files = await self.queue.get()
                await self._process_job(job_id, files)
                self.queue.task_done()
            except Exception as e:
                logger.error(f"[BatchQueue] Worker error: {e}")
                await asyncio.sleep(1)
    
    async def _process_job(self, job_id: str, files: list[str]):
        """Process all files in a job."""
        logger.info(f"[BatchQueue] Processing job {job_id}")
        
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        
        # Update job status
        c.execute('''
            UPDATE batch_jobs SET status = ? WHERE job_id = ?
        ''', ("processing", job_id))
        conn.commit()
        
        processed = 0
        failed = 0
        lang_counts = {}
        
        for filename in files:
            try:
                # Update file status
                c.execute('''
                    UPDATE batch_files SET status = ? WHERE job_id = ? AND filename = ?
                ''', ("processing", job_id, filename))
                conn.commit()
                
                # Process file (blocking call in executor)
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: self.process_fn(
                        str(Path(filename).parent / Path(filename).name),
                        "auto"
                    )
                )
                
                # Store result
                lang = result.get("language_detected", "Unknown")
                lang_counts[lang] = lang_counts.get(lang, 0) + 1
                
                result_json = json.dumps(result)
                c.execute('''
                    UPDATE batch_files
                    SET status = ?, confidence_score = ?, routing = ?,
                        language_detected = ?, result_json = ?, processed_at = ?
                    WHERE job_id = ? AND filename = ?
                ''', (
                    "done",
                    result.get("confidence_score", 0.0),
                    result.get("routing", "UNKNOWN"),
                    lang,
                    result_json,
                    datetime.now().isoformat(),
                    job_id,
                    filename
                ))
                conn.commit()
                processed += 1
                
            except Exception as e:
                logger.error(f"[BatchQueue] File {filename} failed: {e}")
                c.execute('''
                    UPDATE batch_files
                    SET status = ?, error_message = ?
                    WHERE job_id = ? AND filename = ?
                ''', ("failed", str(e), job_id, filename))
                conn.commit()
                failed += 1
        
        # Finalize job
        c.execute('''
            UPDATE batch_jobs
            SET status = ?, processed_files = ?, failed_files = ?
            WHERE job_id = ?
        ''', ("done", processed, failed, job_id))
        
        # Store language summary
        c.execute('''
            INSERT OR REPLACE INTO batch_language_summary
            (job_id, language_counts)
            VALUES (?, ?)
        ''', (job_id, json.dumps(lang_counts)))
        
        conn.commit()
        conn.close()
        
        self.job_status[job_id] = {
            "status": "done",
            "processed": processed,
            "failed": failed,
            "languages": lang_counts
        }
        
        logger.success(f"[BatchQueue] Job {job_id} complete (processed={processed}, failed={failed})")
    
    def get_job_status(self, job_id: str) -> dict:
        """Get current job status."""
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        
        c.execute('''
            SELECT status, total_files, processed_files, failed_files
            FROM batch_jobs WHERE job_id = ?
        ''', (job_id,))
        
        row = c.fetchone()
        conn.close()
        
        if not row:
            return {"error": "Job not found"}
        
        status, total, processed, failed = row
        return {
            "job_id": job_id,
            "status": status,
            "total_files": total,
            "processed_files": processed,
            "failed_files": failed,
            "progress_percent": int((processed / total * 100) if total > 0 else 0)
        }
    
    def get_job_files(self, job_id: str) -> list[dict]:
        """Get all files in a job with their status."""
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        
        c.execute('''
            SELECT filename, status, confidence_score, routing, language_detected, result_json
            FROM batch_files WHERE job_id = ?
        ''', (job_id,))
        
        files = []
        for row in c.fetchall():
            filename, status, conf, routing, lang, result_json = row
            files.append({
                "filename": filename,
                "status": status,
                "confidence_score": conf or 0.0,
                "routing": routing or "UNKNOWN",
                "language_detected": lang,
                "result": json.loads(result_json) if result_json else None
            })
        
        conn.close()
        return files

