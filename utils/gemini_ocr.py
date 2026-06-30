"""
Gemini Vision OCR engine + Tesseract fallback.
Handles degraded scans, multilingual text, auto language detection.
"""

import os
import base64
import json
import re
from typing import Any
from pathlib import Path
from loguru import logger

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.warning("google-generativeai not installed, Gemini mode unavailable")

import pytesseract
from PIL import Image
import numpy as np
import cv2

try:
    from langdetect import detect
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False
    logger.warning("langdetect not installed, language detection unavailable")

try:
    from spellchecker import SpellChecker
    SPELLCHECKER_AVAILABLE = True
except ImportError:
    SPELLCHECKER_AVAILABLE = False
    logger.warning("pyspellchecker not installed, spell correction unavailable")


class GeminiOCREngine:
    """Gemini Vision primary, Tesseract fallback for offline."""
    
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_enabled = GEMINI_AVAILABLE and bool(self.gemini_api_key)
        
        if self.gemini_enabled:
            try:
                genai.configure(api_key=self.gemini_api_key)
                self.gemini_model = genai.GenerativeModel("gemini-1.5-flash")
                logger.success("Gemini Vision OCR enabled (free tier, 15 req/min)")
            except Exception as e:
                logger.warning(f"Gemini init failed: {e}, falling back to Tesseract")
                self.gemini_enabled = False
        else:
            logger.info("GEMINI_API_KEY not set, using Tesseract offline mode")
    
    def _image_to_base64(self, img: np.ndarray) -> str:
        """Convert numpy array to base64 PNG."""
        _, encoded = cv2.imencode('.png', img)
        return base64.b64encode(encoded.tobytes()).decode('ascii')
    
    def _call_gemini_vision(self, img: np.ndarray) -> dict[str, Any]:
        """
        Send raw image to Gemini Vision for OCR + field extraction.
        Returns JSON with all fields extracted.
        """
        try:
            b64_image = self._image_to_base64(img)
            
            prompt = """You are an expert invoice/receipt OCR system. Analyze this image and extract all fields as JSON.

This document may be in Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu, or English.
Extract all fields regardless of language. For vendor/customer names in non-Latin scripts, provide English transliteration.

Output ONLY valid JSON (no markdown, no backticks, no explanation):

{
  "invoice_number": null,
  "invoice_date": null,
  "due_date": null,
  "vendor_name": null,
  "vendor_address": null,
  "vendor_gstin": null,
  "vendor_pan": null,
  "vendor_phone": null,
  "customer_name": null,
  "customer_address": null,
  "customer_gstin": null,
  "line_items": [],
  "subtotal": null,
  "cgst_amount": null,
  "sgst_amount": null,
  "igst_amount": null,
  "total_tax": null,
  "total_amount": null,
  "amount_in_words": null,
  "payment_terms": null,
  "bank_name": null,
  "account_number": null,
  "ifsc_code": null,
  "currency": "INR",
  "language_detected": null,
  "notes": null
}"""
            
            response = self.gemini_model.generate_content([
                {"mime_type": "image/png", "data": b64_image},
                prompt
            ])
            
            raw_text = response.text.strip()
            # Remove markdown code fence if present
            raw_text = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_text, flags=re.MULTILINE)
            
            data = json.loads(raw_text)
            if isinstance(data, dict):
                logger.success("[Gemini] Extraction successful")
                return data
            else:
                logger.warning("[Gemini] Response was not a dict, parsing failed")
                return self._empty_result()
                
        except json.JSONDecodeError as e:
            logger.error(f"[Gemini] JSON parse error: {e}, using fallback")
            return self._empty_result()
        except Exception as e:
            logger.error(f"[Gemini] API error: {e}, falling back to Tesseract")
            return None  # Signal to use Tesseract
    
    def _tesseract_ocr(self, img: np.ndarray, language: str = "auto") -> str:
        """
        Fallback: Local Tesseract OCR with preprocessing for degraded scans.
        """
        logger.info("[Tesseract] Starting local OCR (fallback mode)")
        
        # Adaptive histogram equalization for better contrast
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Remove dark borders/stamps using contour detection
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(255 - binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            # Remove largest dark contours (likely stamps/borders)
            for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:2]:
                cv2.drawContours(binary, [cnt], 0, 255, -1)
        
        # Choose PSM based on aspect ratio
        h, w = binary.shape
        aspect_ratio = w / h
        psm = 4 if aspect_ratio > 1.5 else 6  # 4=column, 6=uniform block
        
        lang_map = {
            "auto": "eng+hin+tam+tel+ben+mar",
            "english": "eng",
            "hindi": "hin+eng",
            "tamil": "tam+eng",
            "telugu": "tel+eng",
            "bengali": "ben+eng",
            "marathi": "mar+eng",
        }
        lang = lang_map.get(language.lower(), "eng+hin+tam+tel+ben+mar")
        
        try:
            pil = Image.fromarray(binary)
            ocr_text = pytesseract.image_to_string(
                pil,
                lang=lang,
                config=f"--oem 3 --psm {psm}"
            )
            
            # Spell-check only English words, preserve Indian language text
            if SPELLCHECKER_AVAILABLE and "eng" in lang:
                ocr_text = self._spell_check_english(ocr_text)
            
            logger.success(f"[Tesseract] OCR complete ({len(ocr_text)} chars)")
            return ocr_text
            
        except Exception as e:
            logger.error(f"[Tesseract] OCR failed: {e}")
            return ""
    
    def _spell_check_english(self, text: str) -> str:
        """Run spell correction on English text only."""
        if not SPELLCHECKER_AVAILABLE:
            return text
        
        spell = SpellChecker()
        words = text.split()
        corrected = []
        
        for word in words:
            # Only correct if it's English (ASCII-only)
            if word.isascii() and not word[0].isdigit():
                corrected_word = spell.correction(word.lower())
                corrected.append(corrected_word if corrected_word else word)
            else:
                corrected.append(word)
        
        return " ".join(corrected)
    
    def _detect_language(self, text: str) -> str:
        """Auto-detect language from OCR text."""
        if not LANGDETECT_AVAILABLE or len(text.strip()) < 10:
            return None
        
        try:
            detected = detect(text[:500])
            lang_map = {
                "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu",
                "bn": "Bengali", "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada",
                "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu"
            }
            return lang_map.get(detected, detected)
        except Exception as e:
            logger.warning(f"[LangDetect] Failed: {e}")
            return None
    
    def _tesseract_to_fields(self, ocr_text: str) -> dict[str, Any]:
        """Convert Tesseract OCR text to structured fields (regex fallback)."""
        logger.info("[Tesseract] Parsing OCR text to fields")
        
        result = self._empty_result()
        
        # Extract key patterns (same as before)
        invoice = re.search(
            r"\b(?:Invoice|Estimate|Bill|Tax\s+Invoice)[^\S\r\n]*(?:No|Number|#)?[^\S\r\n]*[:#.-]*[^\S\r\n]*([A-Z0-9][A-Z0-9/_-]{1,})",
            ocr_text,
            re.IGNORECASE,
        )
        dates = re.findall(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", ocr_text)
        amounts = re.findall(
            r"(?:₹|Rs\s*\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)",
            ocr_text,
            re.IGNORECASE,
        )
        
        if invoice:
            result["invoice_number"] = invoice.group(1)
        if dates:
            result["invoice_date"] = dates[0]
            if len(dates) > 1:
                result["due_date"] = dates[1]
        if amounts:
            result["subtotal"] = f"₹{amounts[0]}" if len(amounts) > 0 else None
            result["total_amount"] = f"₹{amounts[-1]}" if amounts else None
        
        result["_raw_ocr_text"] = ocr_text[:3000]
        result["_ocr_char_count"] = len(ocr_text)
        
        return result
    
    def _empty_result(self) -> dict[str, Any]:
        return {
            "invoice_number": None,
            "invoice_date": None,
            "due_date": None,
            "vendor_name": None,
            "vendor_address": None,
            "vendor_gstin": None,
            "vendor_pan": None,
            "vendor_phone": None,
            "customer_name": None,
            "customer_address": None,
            "customer_gstin": None,
            "line_items": [],
            "subtotal": None,
            "cgst_amount": None,
            "sgst_amount": None,
            "igst_amount": None,
            "total_tax": None,
            "total_amount": None,
            "amount_in_words": None,
            "payment_terms": None,
            "bank_name": None,
            "account_number": None,
            "ifsc_code": None,
            "currency": "INR",
            "language_detected": None,
            "notes": None,
        }
    
    def extract(self, img: np.ndarray, language: str = "auto") -> dict[str, Any]:
        """
        Main entry point: Try Gemini first, fall back to Tesseract.
        """
        result = None
        
        # Try Gemini if enabled
        if self.gemini_enabled:
            logger.info("[OCR] Trying Gemini Vision (cloud)...")
            try:
                result = self._call_gemini_vision(img)
            except Exception as e:
                logger.warning(f"[OCR] Gemini failed: {e}, falling back to Tesseract")
                result = None
        
        # Fall back to Tesseract
        if result is None:
            logger.info("[OCR] Using Tesseract (local fallback)")
            ocr_text = self._tesseract_ocr(img, language)
            result = self._tesseract_to_fields(ocr_text)
            result["_raw_ocr_text"] = ocr_text
        
        # Auto-detect language
        raw_text = result.get("_raw_ocr_text", "")
        if raw_text and not result.get("language_detected"):
            result["language_detected"] = self._detect_language(raw_text)
        
        return result

