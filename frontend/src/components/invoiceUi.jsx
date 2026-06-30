import clsx from "clsx";
import { formatCurrency } from "../data/invoices";

export function RoutingBadge({ routing, size = "sm" }) {
  const approved = routing === "AUTO_APPROVED";
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full border font-bold",
        size === "lg" ? "px-5 py-2 text-sm" : "px-3 py-1 text-xs",
        approved
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          : "border-amber-500/40 bg-amber-500/15 text-amber-300",
      )}
    >
      {approved ? "AUTO APPROVED" : "HUMAN REVIEW"}
    </span>
  );
}

export function AuditBadge({ result }) {
  const pass = result === "PASS";
  return (
    <span
      className={clsx(
        "inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-xs font-bold",
        pass ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300",
      )}
    >
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

export function ConfidenceBar({ value, compact = false }) {
  const percent = Math.round((value || 0) * 100);
  const color = percent >= 85 ? "bg-emerald-500" : percent >= 75 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className={clsx("min-w-32", compact ? "space-y-1" : "space-y-2")}>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Confidence</span>
        <span className="font-mono text-gray-200">{percent}%</span>
      </div>
      <div className={clsx("overflow-hidden rounded-full bg-gray-800", compact ? "h-2" : "h-3")}>
        <div className={clsx("h-full rounded-full", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function StatCard({ label, value, tone = "text-gray-100" }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={clsx("mt-2 text-2xl font-bold", tone)}>{value}</p>
    </div>
  );
}

export function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-100">{value || "-"}</p>
    </div>
  );
}

export function InvoicePreview({ title = "Original", variant = "original", preview }) {
  const isProcessed = variant === "processed";
  const canRender = preview?.url || preview?.dataUrl;
  const src = preview?.dataUrl || preview?.url;
  const isPdf = preview?.type === "application/pdf";

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <span className="text-xs text-gray-500">{isProcessed ? "Deskewed + OCR ready" : preview?.name || "Uploaded image"}</span>
      </div>
      <div className={clsx("aspect-[3/4] overflow-hidden rounded-md border bg-white", isProcessed ? "border-emerald-900" : "border-gray-800")}>
        {canRender ? (
          isPdf ? (
            <object data={src} type="application/pdf" className="h-full w-full bg-white">
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-600">PDF preview is unavailable in this browser.</div>
            </object>
          ) : (
            <img
              src={src}
              alt={title}
              className={clsx("h-full w-full object-contain bg-white", isProcessed && !preview?.dataUrl && "grayscale contrast-125")}
            />
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-5 text-center text-sm text-gray-500">
            <p className="font-semibold text-gray-700">No preview available</p>
            <p className="mt-2">{isProcessed ? "Run the pipeline to generate the preprocessed image." : "Upload an image or PDF to view it here."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(rows, filename) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function invoiceToCsvRows(invoice) {
  return [
    ["filename", "invoice_number", "seller", "amount", "confidence", "routing"],
    [invoice.filename, invoice.invoiceNumber, invoice.seller, formatCurrency(invoice.amount), `${Math.round(invoice.confidence * 100)}%`, invoice.routing],
  ];
}
