from loguru import logger


class ValidationAgent:
    """
    Agent 4: Final consistency checks + routing decision.
    Routes to AUTO_APPROVED or HUMAN_REVIEW.
    """

    def __init__(self, model: str = "llama3", confidence_threshold: float = 0.80):
        self.name = "ValidationAgent"
        self.model = model
        self.threshold = confidence_threshold
        logger.info(f"[Validator] Threshold={confidence_threshold}")

    def validate(self, extracted: dict, audit: dict) -> dict:
        logger.info("[Validator] Running final validation...")
        confidence = float(audit.get("overall_confidence", 0.0))
        verdict = audit.get("audit_verdict", "REVIEW")
        critical = audit.get("critical_issues", [])
        rule_issues = audit.get("rule_based_issues", [])
        warnings = audit.get("warnings", [])

        critical_rule_count = sum(1 for i in rule_issues if "CRITICAL" in i)
        hard_block = critical_rule_count > 0 or len(critical) > 0

        auto_approve = (
            confidence >= self.threshold
            and verdict == "PASS"
            and not hard_block
        )

        routing = "AUTO_APPROVED" if auto_approve else "HUMAN_REVIEW"

        reasons = []
        if confidence < self.threshold:
            reasons.append(
                f"Confidence {confidence:.2f} below threshold {self.threshold}"
            )
        if verdict != "PASS":
            reasons.append(f"LLM audit verdict: {verdict}")
        if hard_block:
            reasons.append(
                f"{critical_rule_count} critical rule violations + "
                f"{len(critical)} LLM critical issues"
            )
        if len(warnings) > 3:
            reasons.append(f"High warning count: {len(warnings)}")

        summary = {
            "invoice_number": extracted.get("invoice_number"),
            "vendor": extracted.get("vendor_name"),
            "customer": extracted.get("customer_name"),
            "total_amount": extracted.get("total_amount"),
            "currency": "INR",
            "invoice_date": extracted.get("invoice_date"),
            "verdict": verdict,
            "routing": routing,
        }

        result = {
            "routing": routing,
            "auto_approved": auto_approve,
            "confidence_score": round(confidence, 4),
            "threshold_used": self.threshold,
            "routing_reasons": reasons,
            "hard_blocked": hard_block,
            "summary": summary,
            "extracted_data": extracted,
            "audit_report": audit,
        }
        logger.success(f"[Validator] Routing → {routing} | confidence={confidence:.2f}")
        return result
