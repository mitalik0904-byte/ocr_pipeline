import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import toast from "react-hot-toast";
import clsx from "clsx";
import { AuditBadge, ConfidenceBar, Field, InvoicePreview, RoutingBadge, downloadCSV, downloadJSON, invoiceToCsvRows } from "../components/invoiceUi";
import { deriveTotalTax, formatCurrency, normalizeApiResult, parseAmount, sampleResult } from "../data/invoices";

const API = "http://localhost:8000";
const steps = ["Upload", "Preprocess", "OCR", "Extract", "Audit", "Route"];

function formatLineAmount(item) {
  if (item.amount || item.total) return item.amount || item.total;
  const qty = Number(item.qty || item.quantity || 0);
  const rate = parseAmount(item.rate || item.unit_price || item.price);
  const amount = qty * rate;
  return amount > 0 ? amount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : "-";
}

function ResultPanel({ invoice, originalPreview }) {
  const [tab, setTab] = useState("fields");
  const fields = invoice.fields || {};
  const rawPayload = invoice.raw || invoice;
  const processedPreview = invoice.preprocessedPreview
    ? { dataUrl: invoice.preprocessedPreview, name: "Preprocessed image", type: "image/png" }
    : originalPreview;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <InvoicePreview preview={originalPreview} />
        <InvoicePreview title="Preprocessed Preview" variant="processed" preview={processedPreview} />
      </div>

      <div className="space-y-5">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">{invoice.filename}</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-100">{invoice.invoiceNumber}</h2>
              <p className="mt-1 text-sm text-gray-400">{invoice.seller} · {formatCurrency(invoice.amount)}</p>
            </div>
            <RoutingBadge routing={invoice.routing} size="lg" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
            <ConfidenceBar value={invoice.confidence} />
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">
              <span className="block text-xs uppercase tracking-wide text-gray-500">Processing time</span>
              <strong className="mt-1 block text-lg text-gray-100">{invoice.processingTime}</strong>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => downloadCSV(invoiceToCsvRows(invoice), `${invoice.invoiceNumber}.csv`)}>Export CSV</button>
            <button className="btn-ghost" onClick={() => downloadJSON(rawPayload, `${invoice.invoiceNumber}.json`)}>Export JSON</button>
          </div>
        </section>

        <div className="flex gap-1 rounded-lg bg-gray-900 p-1">
          {["fields", "audit", "ocr", "debug"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={clsx("flex-1 rounded-md px-3 py-2 text-sm font-semibold capitalize", tab === item ? "bg-indigo-600 text-white" : "text-gray-400 hover:bg-gray-800")}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "fields" && (
          <section className="rounded-lg border border-gray-800 bg-gray-950 p-5">
            <h3 className="mb-4 text-lg font-semibold text-gray-100">Extracted Fields</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Vendor" value={fields.vendor_name || invoice.seller} />
              <Field label="Vendor GSTIN" value={fields.vendor_gstin} />
              <Field label="Customer" value={fields.customer_name} />
              <Field label="Customer GSTIN" value={fields.customer_gstin} />
              <Field label="Invoice date" value={fields.invoice_date || invoice.date} />
              <Field label="Due date" value={fields.due_date} />
              <Field label="Subtotal" value={fields.subtotal} />
              <Field label="CGST" value={fields.cgst_amount} />
              <Field label="SGST" value={fields.sgst_amount} />
              <Field label="Total tax" value={deriveTotalTax(fields)} />
              <Field label="Total amount" value={fields.total_amount || formatCurrency(invoice.amount)} />
              <Field label="IFSC" value={fields.ifsc_code} />
            </div>

            <h3 className="mb-3 mt-6 text-lg font-semibold text-gray-100">Line Items</h3>
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-900 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {(invoice.lineItems || []).map((item) => (
                    <tr key={item.description}>
                      <td className="px-4 py-3 text-gray-200">{item.description}</td>
                      <td className="px-4 py-3 text-gray-400">{item.qty || item.quantity || "-"}</td>
                      <td className="px-4 py-3 text-gray-400">{item.rate || "-"}</td>
                      <td className="px-4 py-3 font-semibold text-gray-100">{formatLineAmount(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "audit" && (
          <section className="rounded-lg border border-gray-800 bg-gray-950 p-5">
            <h3 className="mb-4 text-lg font-semibold text-gray-100">Audit Report</h3>
            <div className="space-y-3">
              {(invoice.audit || []).map((item) => (
                <div key={`${item.rule}-${item.detail}`} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
                  <AuditBadge result={item.result} />
                  <div>
                    <p className="font-semibold text-gray-100">{item.rule}</p>
                    <p className="mt-1 text-sm text-gray-400">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "ocr" && (
          <section className="rounded-lg border border-gray-800 bg-gray-950 p-5">
            <h3 className="mb-4 text-lg font-semibold text-gray-100">Raw OCR Text</h3>
            <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs leading-6 text-gray-300">{invoice.ocrText}</pre>
          </section>
        )}

        {tab === "debug" && (
          <section className="rounded-lg border border-gray-800 bg-gray-950 p-5">
            <h3 className="mb-4 text-lg font-semibold text-gray-100">Debug States</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Surya OCR", "Ready", "text-emerald-300"],
                ["LLM extraction", "Timeout retry enabled", "text-amber-300"],
                ["RAG indexing", "Stored after audit", "text-sky-300"],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                  <p className={clsx("mt-2 text-sm font-semibold", tone)}>{value}</p>
                </div>
              ))}
            </div>
            <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-gray-400">{JSON.stringify(rawPayload, null, 2)}</pre>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Process() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState(sampleResult);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("auto");
  const [originalPreview, setOriginalPreview] = useState(null);

  useEffect(() => () => {
    if (originalPreview?.url) URL.revokeObjectURL(originalPreview.url);
  }, [originalPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"] },
    multiple: true,
    onDrop: (accepted) => {
      setFiles(accepted);
      setError("");
      const first = accepted[0];
      setOriginalPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return first ? { url: URL.createObjectURL(first), name: first.name, type: first.type } : null;
      });
    },
  });

  const batchLabel = useMemo(() => (files.length ? `${files.length} file${files.length > 1 ? "s" : ""} queued` : "Batch upload supported"), [files.length]);

  async function runPipeline() {
    if (!files.length) {
      setResult(sampleResult);
      toast("Showing a sample completed invoice.");
      return;
    }

    setProcessing(true);
    setError("");
    setActiveStep(1);
    const timer = setInterval(() => setActiveStep((step) => Math.min(step + 1, steps.length - 1)), 850);

    try {
      let latestResult = null;
      for (const queuedFile of files) {
        const form = new FormData();
        form.append("file", queuedFile);
        form.append("language", mode);
        form.append("model", "llama3");
        const response = await axios.post(`${API}/api/process`, form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
        latestResult = {
          ...normalizeApiResult(response.data, queuedFile.name),
          previewUrl: originalPreview?.url,
        };
        setResult(latestResult);
      }
      toast.success(files.length > 1 ? `Processed ${files.length} invoices.` : "Pipeline complete.");
    } catch (err) {
      const message = err.response?.data?.detail || err.message || "Pipeline failed";
      setError(message);
      setResult(normalizeApiResult(null, files[0]?.name));
      toast.error(message);
    } finally {
      clearInterval(timer);
      setActiveStep(steps.length - 1);
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Process</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-100">Invoice Processing</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">Upload one invoice or a batch, watch the agent pipeline, then inspect extraction, audit, routing, OCR, and exports.</p>
        </div>
        <RoutingBadge routing={result.routing} size="lg" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div {...getRootProps()} className={clsx("flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition", isDragActive ? "border-indigo-400 bg-indigo-500/10" : "border-gray-700 bg-gray-950 hover:border-gray-500")}>
            <input {...getInputProps()} />
            <p className="text-lg font-semibold text-gray-100">{files[0]?.name || "Drop invoices here"}</p>
            <p className="mt-2 text-sm text-gray-500">{batchLabel} · PDF, PNG, JPG, TIFF, WEBP</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="input max-w-52 bg-gray-950 text-gray-100">
              {[
                ["auto", "Auto detect"],
                ["english", "English"],
                ["hindi", "Hindi + English"],
                ["tamil", "Tamil + English"],
                ["telugu", "Telugu + English"],
                ["bengali", "Bengali + English"],
                ["marathi", "Marathi + English"],
              ].map(([value, label]) => <option key={value} value={value} className="bg-gray-950 text-gray-100">{label}</option>)}
            </select>
            <button className="btn-primary" disabled={processing} onClick={runPipeline}>{processing ? "Processing..." : "Run Pipeline"}</button>
            <button className="btn-ghost" onClick={() => setResult(sampleResult)}>Load Completed Sample</button>
          </div>
          {files.length > 1 && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Batch queue</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {files.map((queuedFile) => (
                  <div key={`${queuedFile.name}-${queuedFile.size}`} className="truncate rounded-md bg-gray-900 px-3 py-2 text-sm text-gray-300">
                    {queuedFile.name}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-semibold text-red-300">Pipeline error</p>
              <p className="mt-1 text-sm text-red-200">{error}</p>
              <p className="mt-2 text-xs text-red-200/80">Result view remains available with last known/sample data so users can continue debugging extraction quality.</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Pipeline</h2>
          <div className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold", index <= activeStep ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-500")}>{index + 1}</span>
                <span className={clsx("text-sm font-medium", index <= activeStep ? "text-gray-100" : "text-gray-500")}>{step}</span>
                {processing && index === activeStep && <span className="ml-auto h-3 w-3 animate-pulse rounded-full bg-indigo-400" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <ResultPanel invoice={result} originalPreview={originalPreview} />
    </div>
  );
}
