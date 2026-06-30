import os
import time
import base64
from datetime import datetime
import numpy as np
import cv2
from pathlib import Path
from PIL import Image
from loguru import logger

from agents.preprocessor import PreprocessingAgent
from agents.auditor       import AuditorAgent
from agents.validator     import ValidationAgent
from agents.rag_agent     import RAGAgent
from utils.result_store   import save_result
from utils.gemini_ocr     import GeminiOCREngine


class OCRPipeline:
    def __init__(self, model: str = "llama3"):
        logger.info("Initializing agents...")
        self.preprocessor = PreprocessingAgent()
        self.auditor      = AuditorAgent(model=model)
        self.validator    = ValidationAgent(model=model)
        self.rag          = RAGAgent(model=model)
        self.ocr_engine   = GeminiOCREngine()  # NEW: Gemini + Tesseract fallback
        self.pdf_dpi      = int(os.getenv("OCR_PDF_DPI", "200"))
        self.store_rag    = os.getenv("OCR_STORE_RAG", "0").lower() in {"1", "true", "yes"}
        
        gemini_status = "enabled" if self.ocr_engine.gemini_enabled else "disabled (using Tesseract)"
        logger.info(f"OCR Engine: Gemini Vision {gemini_status}")
        logger.info(f"PDF settings: dpi={self.pdf_dpi}, store_rag={self.store_rag}")
        logger.success("All agents ready (Gemini primary OCR)")

    def _image_data_url(self, img: np.ndarray) -> str | None:
        try:
            if img is None:
                return None
            ok, encoded = cv2.imencode(".png", img)
            if not ok:
                return None
            payload = base64.b64encode(encoded.tobytes()).decode("ascii")
            return f"data:image/png;base64,{payload}"
        except Exception as exc:
            logger.warning(f"Could not encode preview image: {exc}")
            return None

    def _load_pages(self, file_path: str) -> list:
        """Convert PDF to page images, or return single image path."""
        ext = Path(file_path).suffix.lower()
        if ext == ".pdf":
            from pdf2image import convert_from_path
            imgs = convert_from_path(file_path, dpi=self.pdf_dpi)
            paths = []
            for i, img in enumerate(imgs):
                p = f"/tmp/ocr_pipe_p{i}.png"
                img.save(p, "PNG")
                paths.append(p)
            return paths
        return [file_path]

    def _merge_page_extractions(self, pages: list[dict]) -> dict:
        """Merge multi-page extractions into single result."""
        if not pages:
            return {}
        merged = dict(pages[0])
        merged["line_items"] = []
        raw_chunks = []
        lang_list = []

        for page in pages:
            for key, value in page.items():
                if key == "line_items":
                    if isinstance(value, list):
                        merged["line_items"].extend(value)
                    continue
                if key == "_raw_ocr_text":
                    if value:
                        raw_chunks.append(str(value))
                    continue
                if key == "language_detected" and value:
                    lang_list.append(value)
                    continue
                if key.startswith("_"):
                    merged[key] = value
                    continue
                if merged.get(key) in (None, "", [], "₹0", "₹0.00") and value not in (None, "", []):
                    merged[key] = value

        if raw_chunks:
            merged["_raw_ocr_text"] = "\n\n--- PAGE BREAK ---\n\n".join(raw_chunks)[:6000]
            merged["_ocr_char_count"] = sum(len(chunk) for chunk in raw_chunks)
        
        # Aggregate languages
        if lang_list:
            lang_counts = {}
            for lang in lang_list:
                lang_counts[lang] = lang_counts.get(lang, 0) + 1
            # Pick most common language
            merged["language_detected"] = max(lang_counts, key=lang_counts.get) if lang_counts else None
        
        if len(pages) > 1:
            merged["total_pages"] = len(pages)
            merged["notes"] = (merged.get("notes") or "") + f" Merged extraction from {len(pages)} PDF pages."
        
        return merged

    def run_ocr_only(self, img: np.ndarray, language: str = "auto") -> dict:
        """Fast OCR-only processing for batch operations (no auditing/validation)."""
        start = time.time()
        
        try:
            logger.info("[OCR-Only] Processing image directly")
            
            # Ensure image is in correct format
            if len(img.shape) == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
            elif img.shape[2] == 4:
                img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            
            # Run OCR only
            extracted = self.ocr_engine.extract(img, language)
            
            elapsed = round(time.time() - start, 2)
            extracted["processing_time_seconds"] = elapsed
            extracted["ocr_engine"] = "gemini_vision" if self.ocr_engine.gemini_enabled else "tesseract"
            
            logger.success(f"OCR-only done in {elapsed}s | lang={extracted.get('language_detected')}")
            return extracted
            
        except Exception as e:
            logger.error(f"OCR-only error: {e}")
            return {
                "error": str(e),
                "routing": "HUMAN_REVIEW",
                "confidence_score": 0.0,
                "language_detected": None,
                "processing_time_seconds": round(time.time()-start, 2),
                "ocr_engine": "gemini_vision" if self.ocr_engine.gemini_enabled else "tesseract",
            }

    def run(self, file_path: str, language: str = "auto", progress_cb=None) -> dict:
        start    = time.time()
        filename = Path(file_path).name

        def emit(step, pct):
            if progress_cb: 
                progress_cb(step, pct)

        try:
            emit("preprocessing", 10)
            pages = self._load_pages(file_path)
            page_extractions = []
            preprocessed_preview = None

            for i, page_path in enumerate(pages):
                logger.info(f"Processing page {i+1}/{len(pages)}")
                emit(f"preprocessing", 15 + i*3)

                pre = self.preprocessor.process(page_path)
                if preprocessed_preview is None:
                    preview_img = pre.get("enhanced_image")
                    if preview_img is None:
                        preview_img = pre.get("processed_image")
                    preprocessed_preview = self._image_data_url(preview_img)

                # CHANGED: Get original image for Gemini (skip preprocessing if using cloud)
                if self.ocr_engine.gemini_enabled:
                    # Load original image for Gemini Vision (handles degraded scans natively)
                    ocr_img = cv2.imread(page_path)
                    if ocr_img is None:
                        pil = Image.open(page_path).convert("RGB")
                        ocr_img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
                    logger.info("[Pipeline] Sending original image to Gemini Vision")
                else:
                    # Use preprocessed image for local Tesseract
                    ocr_img = pre.get("enhanced_image", pre["processed_image"])
                    logger.info("[Pipeline] Using preprocessed image for Tesseract")

                if len(ocr_img.shape) == 2:
                    ocr_img = cv2.cvtColor(ocr_img, cv2.COLOR_GRAY2RGB)

                emit("extracting", 35)
                # NEW: Use Gemini OCR engine instead of old extractor
                extracted = self.ocr_engine.extract(ocr_img, language)
                page_extractions.append(extracted)

            extracted = self._merge_page_extractions(page_extractions)
            emit("auditing", 60)
            audit = self.auditor.audit(extracted)

            emit("validating", 80)
            final = self.validator.validate(extracted, audit)
            emit("storing_rag", 90)
            if len(page_extractions) > 1:
                final["total_pages"] = len(page_extractions)

            elapsed = round(time.time() - start, 2)
            final["processing_time_seconds"] = elapsed
            final["filename"] = filename
            final["created_at"] = datetime.now().isoformat(timespec="seconds")
            final["ocr_engine"] = "gemini_vision" if self.ocr_engine.gemini_enabled else "tesseract"
            if preprocessed_preview:
                final["preprocessed_preview"] = preprocessed_preview

            if self.store_rag:
                self.rag.store_result(final, filename)
            else:
                logger.info("Skipping RAG storage. Set OCR_STORE_RAG=1 to enable it.")
            
            saved = save_result(final, filename)
            final["document_id"] = saved["id"]
            emit("done", 100)
            logger.success(
                f"Done in {elapsed}s | {final.get('routing')} | "
                f"lang={final.get('language_detected')} | "
                f"conf={final.get('confidence_score')} | "
                f"engine={final.get('ocr_engine')}"
            )
            return final

        except Exception as e:
            import traceback
            logger.error(f"Pipeline error: {e}\n{traceback.format_exc()}")
            return {
                "error": str(e),
                "routing": "HUMAN_REVIEW",
                "confidence_score": 0.0,
                "language_detected": None,
                "filename": filename,
                "processing_time_seconds": round(time.time()-start, 2),
                "ocr_engine": "gemini_vision" if self.ocr_engine.gemini_enabled else "tesseract",
            }

    def chat(self, message: str, history: list = None) -> str:
        return self.rag.chat(message, history)

    def get_stats(self) -> dict:
        return self.rag.get_stats()
