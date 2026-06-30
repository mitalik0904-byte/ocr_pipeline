import json
import os
import re
import ollama
from datetime import datetime
from loguru import logger


class AuditorAgent:
    """
    Agent 3: Critically audits extraction output.
    Rule-based checks run FIRST, then LLM does adversarial evaluation.
    """

    def __init__(self, model: str = "llama3", use_llm: bool | None = None):
        self.name = "AuditorAgent"
        self.model = model
        self.use_llm = (
            os.getenv("OCR_LLM_AUDIT", "0").lower() in {"1", "true", "yes"}
            if use_llm is None
            else use_llm
        )
        logger.info(f"[Auditor] Initialized with LLM={model}, use_llm={self.use_llm}")

    # ─── Rule-based checks ─────────────────────────────────────────────────────

    def _parse_inr(self, value) -> float | None:
        if value is None:
            return None
        s = str(value)
        s = re.sub(r"[₹,\s]", "", s)
        s = s.replace("INR", "").replace("Rs.", "").replace("Rs", "").strip()
        try:
            return float(s)
        except ValueError:
            return None

    def _check_math(self, data: dict) -> list:
        issues = []
        total = self._parse_inr(data.get("total_amount"))
        subtotal = self._parse_inr(data.get("subtotal"))
        cgst = self._parse_inr(data.get("cgst_amount")) or 0.0
        sgst = self._parse_inr(data.get("sgst_amount")) or 0.0
        igst = self._parse_inr(data.get("igst_amount")) or 0.0
        total_tax = self._parse_inr(data.get("total_tax"))

        if cgst and sgst and igst and igst > 0:
            issues.append(
                "CGST+SGST and IGST both present — mutually exclusive under Indian GST law"
            )

        if total_tax is not None:
            computed_tax = cgst + sgst + igst
            if abs(computed_tax - total_tax) > 2.0:
                issues.append(
                    f"Tax mismatch: CGST({cgst})+SGST({sgst})+IGST({igst})="
                    f"{computed_tax:.2f} ≠ total_tax({total_tax})"
                )

        if total is not None and subtotal is not None:
            tax_sum = cgst + sgst + igst
            expected = subtotal + tax_sum
            discount = self._parse_inr(data.get("discount")) or 0.0
            expected -= discount
            if abs(expected - total) > 2.0:
                issues.append(
                    f"Invoice math error: subtotal({subtotal})+tax({tax_sum:.2f})"
                    f"-discount({discount})={expected:.2f} ≠ total({total})"
                )

        if total is not None and total <= 0:
            issues.append(f"Total amount is zero or negative: {total}")

        return issues

    def _check_gstin(self, data: dict) -> list:
        issues = []
        gstin_pattern = re.compile(
            r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
        )
        state_codes = {
            "01","02","03","04","05","06","07","08","09","10",
            "11","12","13","14","15","16","17","18","19","20",
            "21","22","23","24","25","26","27","28","29","30",
            "31","32","33","34","35","36","37","38"
        }
        for field in ["vendor_gstin", "customer_gstin"]:
            val = data.get(field)
            if val:
                val = str(val).strip().upper()
                if not gstin_pattern.match(val):
                    issues.append(f"Invalid GSTIN format in {field}: '{val}'")
                elif val[:2] not in state_codes:
                    issues.append(f"Unknown state code in {field}: '{val[:2]}'")
        return issues

    def _check_dates(self, data: dict) -> list:
        issues = []
        date_fields = ["invoice_date", "due_date"]
        parsed = {}
        for field in date_fields:
            val = data.get(field)
            if val:
                for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"]:
                    try:
                        parsed[field] = datetime.strptime(str(val).strip(), fmt)
                        break
                    except ValueError:
                        continue
                if field not in parsed:
                    issues.append(f"Unparseable date in {field}: '{val}'")
                else:
                    d = parsed[field]
                    if d.year < 2000 or d.year > 2030:
                        issues.append(f"Implausible year in {field}: {d.year}")

        if "invoice_date" in parsed and "due_date" in parsed:
            if parsed["due_date"] < parsed["invoice_date"]:
                issues.append("due_date is earlier than invoice_date")

        return issues

    def _check_completeness(self, data: dict) -> list:
        issues = []
        critical_fields = [
            "invoice_number", "invoice_date", "vendor_name",
            "customer_name", "total_amount"
        ]
        important_fields = [
            "vendor_gstin", "subtotal", "payment_terms"
        ]
        for f in critical_fields:
            if not data.get(f):
                issues.append(f"CRITICAL missing field: '{f}'")
        for f in important_fields:
            if not data.get(f):
                issues.append(f"Missing field: '{f}'")
        return issues

    def _check_ifsc(self, data: dict) -> list:
        issues = []
        ifsc = data.get("ifsc_code")
        if ifsc:
            pattern = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
            if not pattern.match(str(ifsc).strip().upper()):
                issues.append(f"Invalid IFSC format: '{ifsc}'")
        return issues

    def _run_all_rule_checks(self, data: dict) -> list:
        all_issues = []
        all_issues.extend(self._check_completeness(data))
        all_issues.extend(self._check_math(data))
        all_issues.extend(self._check_gstin(data))
        all_issues.extend(self._check_dates(data))
        all_issues.extend(self._check_ifsc(data))
        return all_issues

    # ─── LLM adversarial audit ─────────────────────────────────────────────────

    def _llm_audit(self, data: dict, rule_issues: list) -> dict:
        prompt = f"""You are a STRICT senior auditor specializing in Indian GST invoices.
Your job is to FIND PROBLEMS in the extracted data — not to validate it.
Be adversarial. Be skeptical. Assume extraction errors are common.

Rule-based engine already found these issues:
{json.dumps(rule_issues, indent=2)}

Extracted invoice data to audit:
{json.dumps({k: v for k, v in data.items() if not k.startswith("_")}, indent=2, ensure_ascii=False)}

Audit for ALL of the following:
1. FABRICATION: Are any field values suspiciously round, implausible, or likely hallucinated by OCR?
2. CONSISTENCY: Does vendor state code in GSTIN match the invoice address state?
3. AMOUNT PLAUSIBILITY: Are line item amounts consistent with the subtotal?
4. DATE LOGIC: Is the invoice date in a reasonable range? Is due_date after invoice_date?
5. FORMAT ERRORS: Check PAN embedded in GSTIN matches vendor_pan if both present
6. CURRENCY: Are all monetary values in INR? Flag any foreign currency amounts
7. OCR ARTIFACTS: Do any field values look like garbled OCR output?
8. MISSING CONTEXT: What critical business information is absent?

Scoring rubric:
- Start at 1.0
- Deduct 0.15 per CRITICAL missing field
- Deduct 0.10 per math error
- Deduct 0.08 per invalid GSTIN/IFSC/PAN
- Deduct 0.05 per implausible/suspicious value
- Deduct 0.03 per minor inconsistency
- Minimum score: 0.0

Return ONLY valid JSON — no markdown, no explanation:
{{
  "overall_confidence": 0.0,
  "field_confidence": {{}},
  "critical_issues": [],
  "warnings": [],
  "suggestions": [],
  "audit_verdict": "PASS",
  "ocr_quality": "good",
  "reasoning": ""
}}

audit_verdict must be: "PASS" (confidence≥0.80), "REVIEW" (0.50–0.79), "FAIL" (<0.50)
ocr_quality must be: "good", "degraded", or "poor"
"""

        try:
            response = ollama.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.2, "num_predict": 2048}
            )
            content = response["message"]["content"].strip()
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                content = content[start:end]
            result = json.loads(content)
            logger.success(
                f"[Auditor] LLM verdict: {result.get('audit_verdict')} "
                f"| confidence: {result.get('overall_confidence')}"
            )
            return result
        except Exception as e:
            logger.error(f"[Auditor] LLM audit failed: {e}")
            base_score = max(0.0, 1.0 - len(rule_issues) * 0.12)
            verdict = "PASS" if base_score >= 0.8 else ("REVIEW" if base_score >= 0.5 else "FAIL")
            return {
                "overall_confidence": round(base_score, 2),
                "field_confidence": {},
                "critical_issues": [i for i in rule_issues if "CRITICAL" in i],
                "warnings": [i for i in rule_issues if "CRITICAL" not in i],
                "suggestions": [],
                "audit_verdict": verdict,
                "ocr_quality": "unknown",
                "reasoning": "LLM audit unavailable — rule-based scoring only",
            }

    def _rule_only_audit(self, rule_issues: list) -> dict:
        critical = [i for i in rule_issues if "CRITICAL" in i]
        warnings = [i for i in rule_issues if "CRITICAL" not in i]
        base_score = 1.0
        base_score -= len(critical) * 0.18
        base_score -= len(warnings) * 0.06
        score = max(0.0, round(base_score, 2))
        verdict = "PASS" if score >= 0.8 else ("REVIEW" if score >= 0.5 else "FAIL")
        return {
            "overall_confidence": score,
            "field_confidence": {},
            "critical_issues": critical,
            "warnings": warnings,
            "suggestions": [],
            "audit_verdict": verdict,
            "ocr_quality": "good" if score >= 0.8 else "degraded",
            "reasoning": "Fast rule-based audit. Set OCR_LLM_AUDIT=1 to enable adversarial LLM audit.",
        }

    def audit(self, extracted_data: dict) -> dict:
        logger.info("[Auditor] Starting audit...")
        rule_issues = self._run_all_rule_checks(extracted_data)
        logger.info(f"[Auditor] Rule checks: {len(rule_issues)} issues found")
        llm_result = (
            self._llm_audit(extracted_data, rule_issues)
            if self.use_llm
            else self._rule_only_audit(rule_issues)
        )
        llm_result["rule_based_issues"] = rule_issues
        llm_result["total_issues_found"] = (
            len(llm_result.get("critical_issues", []))
            + len(llm_result.get("warnings", []))
            + len(rule_issues)
        )
        return llm_result
