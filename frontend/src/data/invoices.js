export const invoices = [
  {
    id: "doc-001",
    filename: "surya-retail-invoice-001.pdf",
    invoiceNumber: "INV-001",
    seller: "Surya Retail Traders",
    amount: 184250,
    date: "2026-06-24",
    confidence: 0.94,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "18.4s",
    audit: [
      { rule: "GSTIN format", result: "PASS", detail: "Both seller and buyer GSTIN match expected format." },
      { rule: "Subtotal + tax = total", result: "PASS", detail: "Calculated total matches extracted total." },
      { rule: "Invoice date present", result: "PASS", detail: "Invoice date was extracted with high confidence." },
      { rule: "Bank details present", result: "PASS", detail: "IFSC and account number were found." },
    ],
    fields: {
      vendor_name: "Surya Retail Traders",
      vendor_gstin: "27ABCDE1234F1Z5",
      customer_name: "Apex Foods Pvt Ltd",
      customer_gstin: "29AAHCA3128L1Z8",
      invoice_number: "INV-001",
      invoice_date: "2026-06-24",
      due_date: "2026-07-08",
      subtotal: "156,144.07",
      cgst_amount: "14,052.97",
      sgst_amount: "14,052.96",
      total_tax: "28,105.93",
      total_amount: "184,250.00",
      bank_name: "HDFC Bank",
      ifsc_code: "HDFC0000240",
    },
    lineItems: [
      { description: "Packaged rice bags", qty: 80, rate: "1,450.00", amount: "116,000.00" },
      { description: "Logistics surcharge", qty: 1, rate: "40,144.07", amount: "40,144.07" },
    ],
    ocrText:
      "SURYA RETAIL TRADERS\nInvoice INV-001\nBill To: Apex Foods Pvt Ltd\nSubtotal 156144.07\nCGST 14052.97\nSGST 14052.96\nTotal INR 184250.00\nPayment due 08-Jul-2026",
  },
  {
    id: "doc-002",
    filename: "metro-electricals-june.pdf",
    invoiceNumber: "ME-2241",
    seller: "Metro Electricals",
    amount: 58740,
    date: "2026-06-23",
    confidence: 0.78,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "21.8s",
    audit: [
      { rule: "GSTIN format", result: "PASS", detail: "Seller GSTIN is valid." },
      { rule: "Subtotal + tax = total", result: "FAIL", detail: "Tax total differs by INR 140.00." },
      { rule: "Invoice date present", result: "PASS", detail: "Date extracted from header." },
      { rule: "Vendor bank details", result: "FAIL", detail: "IFSC was not detected." },
    ],
    fields: {
      vendor_name: "Metro Electricals",
      vendor_gstin: "07AAACM5555K1Z2",
      customer_name: "Green Valley Stores",
      invoice_number: "ME-2241",
      invoice_date: "2026-06-23",
      subtotal: "49,660.00",
      total_tax: "8,940.00",
      total_amount: "58,740.00",
    },
    lineItems: [
      { description: "LED tube lights", qty: 120, rate: "310.00", amount: "37,200.00" },
      { description: "Copper wire bundle", qty: 8, rate: "1,557.50", amount: "12,460.00" },
    ],
    ocrText:
      "METRO ELECTRICALS\nInvoice ME-2241\nLED TUBE LIGHTS 120\nCopper wire bundle 8\nSubtotal 49660\nTax 8940\nTotal 58740\nIFSC unclear",
  },
  {
    id: "doc-003",
    filename: "nandini-logistics-784.png",
    invoiceNumber: "NL-784",
    seller: "Nandini Logistics",
    amount: 92720,
    date: "2026-06-22",
    confidence: 0.88,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "14.2s",
  },
  {
    id: "doc-004",
    filename: "zenith-office-supplies.pdf",
    invoiceNumber: "ZOS-911",
    seller: "Zenith Office Supplies",
    amount: 14320,
    date: "2026-06-21",
    confidence: 0.63,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "29.1s",
  },
  {
    id: "doc-005",
    filename: "kaveri-printing-0620.pdf",
    invoiceNumber: "KP-0620",
    seller: "Kaveri Printing Works",
    amount: 33190,
    date: "2026-06-20",
    confidence: 0.91,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "16.7s",
  },
  {
    id: "doc-006",
    filename: "omega-packaging-778.pdf",
    invoiceNumber: "OP-778",
    seller: "Omega Packaging",
    amount: 71884,
    date: "2026-06-19",
    confidence: 0.84,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "19.5s",
  },
  {
    id: "doc-007",
    filename: "bhavani-steel-bill.jpg",
    invoiceNumber: "BS-441",
    seller: "Bhavani Steel Mart",
    amount: 228600,
    date: "2026-06-18",
    confidence: 0.71,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "31.0s",
  },
  {
    id: "doc-008",
    filename: "pixel-data-services.pdf",
    invoiceNumber: "PDS-192",
    seller: "Pixel Data Services",
    amount: 47200,
    date: "2026-06-17",
    confidence: 0.97,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "12.9s",
  },
  {
    id: "doc-009",
    filename: "arya-medical-902.pdf",
    invoiceNumber: "AM-902",
    seller: "Arya Medical Agency",
    amount: 66540,
    date: "2026-06-16",
    confidence: 0.82,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "17.3s",
  },
  {
    id: "doc-010",
    filename: "lakshmi-textiles-305.pdf",
    invoiceNumber: "LT-305",
    seller: "Lakshmi Textiles",
    amount: 119440,
    date: "2026-06-15",
    confidence: 0.57,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "34.6s",
  },
  {
    id: "doc-011",
    filename: "orbit-security-551.pdf",
    invoiceNumber: "OS-551",
    seller: "Orbit Security Systems",
    amount: 38600,
    date: "2026-06-14",
    confidence: 0.89,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "18.0s",
  },
  {
    id: "doc-012",
    filename: "sri-ganesh-catering.pdf",
    invoiceNumber: "SGC-118",
    seller: "Sri Ganesh Catering",
    amount: 24780,
    date: "2026-06-13",
    confidence: 0.74,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "26.4s",
  },
  {
    id: "doc-013",
    filename: "bluebay-hardware.pdf",
    invoiceNumber: "BBH-640",
    seller: "Bluebay Hardware",
    amount: 52310,
    date: "2026-06-12",
    confidence: 0.86,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "15.8s",
  },
  {
    id: "doc-014",
    filename: "city-fuel-station-404.pdf",
    invoiceNumber: "CFS-404",
    seller: "City Fuel Station",
    amount: 16490,
    date: "2026-06-11",
    confidence: 0.81,
    routing: "AUTO_APPROVED",
    status: "Processed",
    processingTime: "13.5s",
  },
  {
    id: "doc-015",
    filename: "vijay-tools-0609.pdf",
    invoiceNumber: "VT-0609",
    seller: "Vijay Tools",
    amount: 80110,
    date: "2026-06-09",
    confidence: 0.69,
    routing: "HUMAN_REVIEW",
    status: "Needs review",
    processingTime: "28.2s",
  },
];

export const sampleResult = invoices[0];

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function parseAmount(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveTotalTax(fields = {}) {
  if (fields.total_tax) return fields.total_tax;
  const tax = parseAmount(fields.cgst_amount) + parseAmount(fields.sgst_amount) + parseAmount(fields.igst_amount);
  return tax > 0 ? tax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
}

export function normalizeApiResult(result, fallbackFileName = "invoice.pdf") {
  if (!result) return sampleResult;
  const fields = result.extracted_data || result.fields || {};
  const enrichedFields = { ...fields, total_tax: deriveTotalTax(fields) };
  const auditReport = result.audit_report || {};
  const confidence = result.confidence_score ?? auditReport.overall_confidence ?? result.confidence ?? 0.82;
  const audit = [
    ...(auditReport.critical_issues || []).map((detail) => ({ rule: "Critical issue", result: "FAIL", detail })),
    ...(auditReport.warnings || []).map((detail) => ({ rule: "Warning", result: "FAIL", detail })),
  ];

  return {
    id: result.id || `doc-${Date.now()}`,
    filename: result.filename || fallbackFileName,
    invoiceNumber: fields.invoice_number || result.invoiceNumber || "Pending",
    seller: fields.vendor_name || result.seller || "Unknown seller",
    amount: Number(String(fields.total_amount || result.amount || 0).replace(/[^0-9.]/g, "")),
    date: fields.invoice_date || result.date || new Date().toISOString().slice(0, 10),
    confidence,
    routing: result.routing || (confidence >= 0.8 ? "AUTO_APPROVED" : "HUMAN_REVIEW"),
    status: result.status || "Processed",
    processingTime: result.processing_time_seconds ? `${result.processing_time_seconds}s` : result.processingTime || "Complete",
    audit: audit.length ? audit : sampleResult.audit,
    fields: enrichedFields,
    lineItems: enrichedFields.line_items || result.lineItems || [],
    ocrText: enrichedFields._raw_ocr_text || result.ocrText || sampleResult.ocrText,
    preprocessedPreview: result.preprocessed_preview || result.preprocessedPreview || null,
    raw: result,
  };
}
