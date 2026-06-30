import json
import re
import ollama
import chromadb
from datetime import datetime
from loguru import logger


class RAGAgent:
    """
    Agent 5: Retrieval-Augmented Generation chatbot.
    Stores all pipeline results in ChromaDB, retrieves context for every query.
    """

    def __init__(self, model: str = "llama3", embed_model: str = "nomic-embed-text"):
        self.name = "RAGAgent"
        self.model = model
        self.embed_model = embed_model
        self.client = chromadb.PersistentClient(path="./vector_store/chroma_db")
        self.collection = self.client.get_or_create_collection(
            name="invoice_knowledge",
            metadata={"hnsw:space": "cosine"}
        )
        logger.success(
            f"[RAG] Vector store ready — "
            f"{self.collection.count()} documents stored"
        )

    def _embed(self, text: str) -> list:
        try:
            response = ollama.embeddings(model=self.embed_model, prompt=text)
            return response["embedding"]
        except Exception as e:
            logger.error(f"[RAG] Embedding failed: {e}")
            return [0.0] * 768

    def store_result(self, result: dict, filename: str):
        doc_id = (
            f"{filename.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        )
        summary = result.get("summary", {})
        audit = result.get("audit_report", {})
        extracted = result.get("extracted_data", {})
        items = extracted.get("line_items", [])

        doc_text = f"""
INVOICE FILE: {filename}
Invoice Number: {summary.get('invoice_number', 'N/A')}
Invoice Date: {summary.get('invoice_date', 'N/A')}
Vendor Name: {summary.get('vendor', 'N/A')}
Customer Name: {summary.get('customer', 'N/A')}
Total Amount: {summary.get('total_amount', 'N/A')} INR
Vendor GSTIN: {extracted.get('vendor_gstin', 'N/A')}
Customer GSTIN: {extracted.get('customer_gstin', 'N/A')}
Payment Terms: {extracted.get('payment_terms', 'N/A')}
Bank: {extracted.get('bank_name', 'N/A')} | IFSC: {extracted.get('ifsc_code', 'N/A')}
Subtotal: {extracted.get('subtotal', 'N/A')}
CGST: {extracted.get('cgst_amount', 'N/A')} | SGST: {extracted.get('sgst_amount', 'N/A')} | IGST: {extracted.get('igst_amount', 'N/A')}
Line Items: {json.dumps(items, ensure_ascii=False)}
Audit Confidence: {result.get('confidence_score', 0):.2f}
Audit Verdict: {audit.get('audit_verdict', 'N/A')}
Routing Decision: {result.get('routing', 'N/A')}
Critical Issues: {'; '.join(audit.get('critical_issues', [])) or 'None'}
Rule Issues: {'; '.join(audit.get('rule_based_issues', [])) or 'None'}
Warnings: {'; '.join(audit.get('warnings', [])) or 'None'}
OCR Quality: {audit.get('ocr_quality', 'N/A')}
Processing Time: {result.get('processing_time_seconds', 'N/A')}s
Language: {extracted.get('language_detected', 'N/A')}
""".strip()

        embedding = self._embed(doc_text)
        metadata = {
            "filename": filename,
            "invoice_number": str(summary.get("invoice_number") or ""),
            "vendor": str(summary.get("vendor") or ""),
            "customer": str(summary.get("customer") or ""),
            "total_amount": str(summary.get("total_amount") or ""),
            "routing": result.get("routing", ""),
            "confidence": float(result.get("confidence_score", 0)),
            "verdict": audit.get("audit_verdict", ""),
            "timestamp": datetime.now().isoformat(),
        }
        self.collection.add(
            ids=[doc_id],
            documents=[doc_text],
            embeddings=[embedding],
            metadatas=[metadata],
        )
        logger.success(f"[RAG] Stored: {doc_id} (total: {self.collection.count()})")

    def chat(self, query: str, history: list = None) -> str:
        count = self.collection.count()
        if count == 0:
            return (
                "No invoice data has been processed yet. "
                "Please upload and process an invoice first, then ask your question."
            )

        query_embedding = self._embed(query)
        n = min(5, count)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n,
        )
        context_docs = results.get("documents", [[]])[0]
        context_meta = results.get("metadatas", [[]])[0]

        context_str = ""
        for i, (doc, meta) in enumerate(zip(context_docs, context_meta)):
            context_str += f"\n--- Invoice {i+1}: {meta.get('filename', 'unknown')} ---\n{doc}\n"

        history_str = ""
        if history:
            for user_msg, bot_msg in history[-4:]:
                history_str += f"User: {user_msg}\nAssistant: {bot_msg}\n"

        prompt = f"""You are an intelligent invoice audit assistant for an Indian business.
You have access to real invoice data extracted and audited by an automated pipeline.

RETRIEVED INVOICE CONTEXT ({n} most relevant results):
{context_str}

RECENT CONVERSATION:
{history_str}

USER QUESTION: {query}

Answer using ONLY the context provided. Be specific and cite invoice numbers/vendors when relevant.
For monetary values, always use ₹ (INR). If the answer is not in the context, say clearly:
"This information is not available in the processed invoices."
Do NOT guess or fabricate any data."""

        try:
            response = ollama.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.3, "num_predict": 1024}
            )
            return response["message"]["content"]
        except Exception as e:
            logger.error(f"[RAG] Chat error: {e}")
            return f"Error connecting to LLM: {e}. Ensure Ollama is running: ollama serve"

    def get_stats(self) -> dict:
        count = self.collection.count()
        if count == 0:
            return {"total_invoices": 0}
        try:
            results = self.collection.get(include=["metadatas"])
            metas = results.get("metadatas", [])
            approved = sum(1 for m in metas if m.get("routing") == "AUTO_APPROVED")
            review = sum(1 for m in metas if m.get("routing") == "HUMAN_REVIEW")
            avg_conf = (
                sum(float(m.get("confidence", 0)) for m in metas) / len(metas)
                if metas else 0
            )
            return {
                "total_invoices": count,
                "auto_approved": approved,
                "human_review": review,
                "avg_confidence": round(avg_conf, 3),
            }
        except Exception as e:
            return {"total_invoices": count, "error": str(e)}
