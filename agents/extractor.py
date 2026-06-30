import json
import os
import re
from typing import Any

import numpy as np
import ollama
from PIL import Image
from loguru import logger


class ExtractionAgent:
    def __init__(self, model: str = "llama3"):
        self.name = "ExtractionAgent"
        self.model = model
        self.fast_mode = os.getenv("OCR_FAST_MODE", "1").lower() in {"1", "true", "yes"}

    def _ocr(self, img: np.ndarray, language: str) -> str:
        import pytesseract

        lang_map = {
            "auto": "eng" if self.fast_mode else "eng+hin+tam+tel+ben+mar",
            "english": "eng",
            "hindi": "hin+eng",
            "tamil": "tam+eng",
            "telugu": "tel+eng",
            "bengali": "ben+eng",
            "marathi": "mar+eng",
        }
        lang = lang_map.get(language.lower(), "eng")

        if img.ndim == 2:
            pil = Image.fromarray(img)
        else:
            pil = Image.fromarray(img.astype("uint8")).convert("RGB")

        best_text = ""
        best_score = -1
        best_psm = None
        for psm in (4, 6, 3):
            try:
                text = pytesseract.image_to_string(
                    pil,
                    lang=lang,
                    config=f"--oem 3 --psm {psm}",
                )
            except Exception as exc:
                logger.warning(f"[Extractor] Tesseract PSM {psm} failed: {exc}")
                continue

            score = sum(ch.isalnum() for ch in text)
            logger.info(f"[Extractor] PSM {psm}: {len(text)} chars, alnum={score}")
            if score > best_score:
                best_text = text
                best_score = score
                best_psm = psm
            if psm == 4 and score >= 250 and re.search(r"\b(invoice|gstin|total)\b", text, re.I):
                break

        logger.info(
            f"[Extractor] selected PSM {best_psm}: {len(best_text)} chars, alnum={best_score}"
        )
        return best_text

    def _parse_json(self, text: str) -> dict[str, Any] | None:
        raw = text.strip()

        unfenced = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            raw,
            flags=re.IGNORECASE,
        ).strip()
        object_match = re.search(r"\{.*\}", unfenced, flags=re.DOTALL)
        fenced_or_object = object_match.group(0) if object_match else unfenced

        strategies = (
            raw,
            fenced_or_object,
            re.sub(r",\s*([}\]])", r"\1", fenced_or_object),
        )

        for candidate in strategies:
            try:
                parsed = json.loads(candidate)
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                continue
        return None

    def _llm_extract(self, ocr_text: str) -> dict[str, Any]:
        if len(ocr_text.strip()) < 20:
            return self._regex_fallback(ocr_text)

        prompt = f"""OUTPUT ONLY THE JSON OBJECT — no markdown, no backticks, no explanation.

Extract invoice fields from the OCR text below. Use null for missing values.
Normalize all currency values to INR using the rupee symbol.

OCR TEXT:
---
{ocr_text[:5000]}
---

{{
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
}}"""

        try:
            response = ollama.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.0, "num_predict": 2048},
            )
            raw = response["message"]["content"].strip()
            data = self._parse_json(raw)
            if data:
                data = self._normalize_currency(data)
                data = self._normalize_gstins(data)
                fallback = self._regex_fallback(ocr_text)
                data = self._merge_missing(data, fallback)
                if self._extraction_score(data) < 5:
                    logger.warning("[Extractor] LLM output sparse; keeping merged LLM+regex data")
                    return data
                nonnull = sum(
                    1
                    for key, value in data.items()
                    if not key.startswith("_") and value not in (None, [], "")
                )
                logger.success(f"[Extractor] {nonnull} fields extracted")
                return data
            logger.warning("[Extractor] LLM JSON parse failed; using regex fallback")
        except Exception as exc:
            logger.error(f"[Extractor] LLM error: {exc}")

        return self._regex_fallback(ocr_text)

    def _extraction_score(self, data: dict[str, Any]) -> int:
        important_fields = (
            "invoice_number",
            "invoice_date",
            "due_date",
            "vendor_name",
            "vendor_gstin",
            "customer_name",
            "customer_gstin",
            "subtotal",
            "cgst_amount",
            "sgst_amount",
            "total_amount",
            "bank_name",
            "ifsc_code",
            "account_number",
        )
        return sum(1 for field in important_fields if data.get(field))

    def _merge_missing(self, primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
        for key, value in fallback.items():
            if key.startswith("_"):
                continue
            if primary.get(key) in (None, "", []):
                primary[key] = value
        return primary

    def _normalize_currency(self, value: Any) -> Any:
        amount_fields = {
            "subtotal",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "total_tax",
            "total_amount",
            "amount",
            "rate",
            "taxable_value",
        }

        if isinstance(value, dict):
            normalized = {}
            for key, item in value.items():
                if key == "currency":
                    normalized[key] = "INR"
                elif key in amount_fields:
                    normalized[key] = self._format_inr(item)
                else:
                    normalized[key] = self._normalize_currency(item)
            normalized.setdefault("currency", "INR")
            return normalized

        if isinstance(value, list):
            return [self._normalize_currency(item) for item in value]

        return value

    def _normalize_gstins(self, data: dict[str, Any]) -> dict[str, Any]:
        for field in ("vendor_gstin", "customer_gstin"):
            value = data.get(field)
            if not value:
                continue
            compact = re.sub(r"[^0-9A-Z]", "", str(value).upper())
            if len(compact) == 16 and compact[14] == "Z":
                compact = compact[:13] + compact[14:]
            if len(compact) == 15 and compact[13] != "Z":
                compact = compact[:13] + "Z" + compact[14:]
            if re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]", compact):
                data[field] = compact
        return data

    def _format_inr(self, value: Any) -> Any:
        if value in (None, ""):
            return None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        text = str(value).strip()
        text = re.sub(r"^(Rs\.?|INR|₹)\s*", "", text, flags=re.IGNORECASE)
        return f"₹{text}"

    def _regex_fallback(self, text: str) -> dict[str, Any]:
        logger.warning("[Extractor] regex fallback")
        result = self._empty()
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        normalized_text = "\n".join(lines)

        invoice = re.search(
            r"\b(?:Invoice|Estimate|Bill|Tax\s+Invoice)[^\S\r\n]*(?:No|Number|#)?[^\S\r\n]*[:#.-]*[^\S\r\n]*([A-Z0-9][A-Z0-9/_-]{1,})",
            text,
            re.IGNORECASE,
        )
        dates = re.findall(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b", text)
        gstins: list[str] = []
        for match in re.finditer(
            r"\b(?:Vendor|Customer)?[^\S\r\n]*GSTIN[^\S\r\n]*[:#-]*[^\S\r\n]*([0-9A-Z][0-9A-Z ]{13,24})",
            text,
            re.IGNORECASE,
        ):
            compact = re.sub(r"[^0-9A-Z]", "", match.group(1).upper())
            if len(compact) == 16 and compact[14] == "Z":
                compact = compact[:13] + compact[14:]
            if len(compact) == 15 and compact[13] != "Z":
                compact = compact[:13] + "Z" + compact[14:]
            if re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]", compact):
                gstins.append(compact)
        amounts = re.findall(
            r"(?:₹|Rs\s*\.?)\s*([\d,]+(?:\.\d{1,2})?)",
            text,
            re.IGNORECASE,
        )
        ifsc = re.search(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", text)
        account = re.search(r"\b(?:Account|A/c|Ac)\s*(?:No\.?)?\s*[:#-]*\s*(\d{9,18})", text, re.I)
        bank = re.search(r"\b([A-Z][A-Za-z ]+ Bank)\b", text)

        vendor = re.search(
            r"\bVendor(?:\s+Name)?[^\S\r\n:]*[:#-]?[^\S\r\n]*(.+)",
            text,
            re.IGNORECASE,
        )
        estimate_for = re.search(
            r"\bEstimate\s+For[^\S\r\n:]*[:#-]?[^\S\r\n]*(.+)",
            text,
            re.IGNORECASE,
        )
        company_line = self._guess_vendor_name(lines)
        customer = re.search(
            r"\b(?:Customer|Bill\s+To|Billed\s+To|Buyer|Estimate\s+For)(?:\s+Name)?[^\S\r\n:]*[:#-]?[^\S\r\n]*(.+)",
            text,
            re.IGNORECASE,
        )

        if invoice:
            result["invoice_number"] = invoice.group(1)
        if dates:
            result["invoice_date"] = dates[0]
        if len(dates) > 1:
            result["due_date"] = dates[1]
        if vendor:
            result["vendor_name"] = vendor.group(1).strip()
        elif company_line:
            result["vendor_name"] = company_line
        if customer:
            result["customer_name"] = customer.group(1).strip()
        elif estimate_for:
            result["customer_name"] = estimate_for.group(1).strip()
        if gstins:
            result["vendor_gstin"] = gstins[0]
        if len(gstins) > 1:
            result["customer_gstin"] = gstins[1]
        if amounts:
            result["subtotal"] = f"₹{amounts[0]}"
            result["total_amount"] = f"₹{amounts[-1]}"
        subtotal = re.search(r"\b(?:Subtotal|Sub\s+Total|Taxable\s+Amount)\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        cgst = re.search(r"\bCGST\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        sgst = re.search(r"\bSGST\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        igst = re.search(r"\bIGST\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        total_tax = re.search(r"\bTotal\s+Tax\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        total = re.search(r"\b(?:Grand\s+Total|Total\s+Amount|Net\s+Amount|Total)\b[^\n]*?(?:₹|Rs\s*\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)", normalized_text, re.I)
        if subtotal:
            result["subtotal"] = f"₹{subtotal.group(1)}"
        if cgst:
            result["cgst_amount"] = f"₹{cgst.group(1)}"
        if sgst:
            result["sgst_amount"] = f"₹{sgst.group(1)}"
        if igst:
            result["igst_amount"] = f"₹{igst.group(1)}"
        if total_tax:
            result["total_tax"] = f"₹{total_tax.group(1)}"
        if total:
            result["total_amount"] = f"₹{total.group(1)}"
        if not result.get("total_amount"):
            guessed_total = self._guess_total_amount(lines)
            if guessed_total:
                result["total_amount"] = self._format_inr(guessed_total)
        if not result.get("subtotal") and result.get("total_amount") and result.get("total_tax"):
            total_value = self._amount_to_float(result["total_amount"])
            tax_value = self._amount_to_float(result["total_tax"])
            if total_value is not None and tax_value is not None and total_value > tax_value:
                result["subtotal"] = self._format_inr(total_value - tax_value)
        tax_parts = [
            self._amount_to_float(result.get("cgst_amount")) or 0,
            self._amount_to_float(result.get("sgst_amount")) or 0,
            self._amount_to_float(result.get("igst_amount")) or 0,
        ]
        if not result.get("total_tax") and sum(tax_parts) > 0:
            result["total_tax"] = self._format_inr(sum(tax_parts))
        if ifsc:
            result["ifsc_code"] = ifsc.group(0)
        if account:
            result["account_number"] = account.group(1)
        if bank:
            result["bank_name"] = bank.group(1).strip()
        result["line_items"] = self._extract_line_items(text)

        result["currency"] = "INR"
        result["extraction_method"] = "regex_fallback"
        return result

    def _guess_vendor_name(self, lines: list[str]) -> str | None:
        skip = re.compile(r"(invoice|estimate|gstin|phone|email|address|date|details|pvt ltd|private ltd)", re.I)
        for line in lines[:12]:
            cleaned = re.sub(r"\s+", " ", line).strip(" :-|")
            if len(cleaned) < 3 or len(cleaned) > 80:
                continue
            if skip.search(cleaned):
                continue
            if re.search(r"[A-Za-z]{3,}", cleaned):
                return cleaned
        for line in lines[:12]:
            cleaned = re.sub(r"\s+", " ", line).strip(" :-|")
            if re.search(r"(house|traders|services|solutions|enterprise|company|store|mart|agency)", cleaned, re.I):
                return cleaned
        return None

    def _guess_total_amount(self, lines: list[str]) -> float | None:
        candidates: list[float] = []
        total_lines = [line for line in lines if re.search(r"\b(total|grand|net|amount)\b", line, re.I)]
        source = total_lines or lines
        for line in source:
            for match in re.findall(r"(?:₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|\d{3,9}(?:\.\d{1,2}))", line, re.I):
                amount = self._amount_to_float(match)
                if amount is not None and amount > 0:
                    candidates.append(amount)
        if candidates:
            return max(candidates)
        return None

    def _amount_to_float(self, value: Any) -> float | None:
        if value in (None, ""):
            return None
        cleaned = re.sub(r"[^\d.]", "", str(value))
        try:
            return float(cleaned)
        except ValueError:
            return None

    def _extract_line_items(self, text: str) -> list[dict[str, Any]]:
        items = []
        in_table = False
        for line in text.splitlines():
            cleaned = re.sub(r"[|©—_]", " ", line.strip())
            cleaned = re.sub(r"\s+", " ", cleaned)
            if re.search(r"\b(?:Description|Item\s*name|Particulars)\b.*\b(?:Qty|Quantity)\b.*\b(?:Rate|Price|Amount)\b", cleaned, re.I):
                in_table = True
                continue
            if re.search(r"\b(?:Subtotal|Sub\s+Total|Total\s+Tax|Grand\s+Total)\b", cleaned, re.I):
                break
            if not in_table:
                continue
            match = re.match(r"^\d*\s*([A-Za-z][A-Za-z0-9 /().+-]+?)\s+(\d.*)$", cleaned)
            if not match:
                continue
            description = match.group(1).strip()
            if description.lower() in {"description", "item name", "subtotal", "total amount"}:
                continue
            numbers = re.findall(r"\d[\d,]*(?:\.\d{1,2})?", match.group(2))
            if len(numbers) < 2:
                continue
            quantity = numbers[0]
            rate = numbers[-2] if len(numbers) >= 3 else numbers[-1]
            amount = numbers[-1]
            if self._amount_to_float(amount) == 0 and len(numbers) >= 3:
                qty_value = self._amount_to_float(quantity) or 0
                rate_value = self._amount_to_float(rate) or 0
                amount = str(round(qty_value * rate_value, 2))
            items.append(
                {
                    "description": description,
                    "quantity": quantity,
                    "rate": self._format_inr(rate),
                    "amount": self._format_inr(amount),
                }
            )
        return items

    def _empty(self) -> dict[str, Any]:
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
        ocr_text = self._ocr(img, language)
        regex_result = self._regex_fallback(ocr_text)
        if self._extraction_score(regex_result) >= 5:
            logger.success(
                f"[Extractor] Regex-first extraction accepted "
                f"| score={self._extraction_score(regex_result)}"
            )
            result = regex_result
        else:
            logger.warning(
                f"[Extractor] Regex extraction sparse "
                f"| score={self._extraction_score(regex_result)} | trying LLM"
            )
            result = self._llm_extract(ocr_text)
        result["_raw_ocr_text"] = ocr_text[:3000]
        result["_ocr_char_count"] = len(ocr_text)
        return result
