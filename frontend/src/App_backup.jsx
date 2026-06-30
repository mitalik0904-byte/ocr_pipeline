import { useState, useEffect, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

const API  = "http://localhost:8000";
const TABS = ["Process","Chat","Stats","Architecture"];

function useDark() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("theme") === "dark" ||
    (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme:dark)").matches)
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark];
}

/* ── helpers ─────────────────────────────────────────────────── */
function Badge({ routing }) {
  if (routing === "AUTO_APPROVED")
    return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ AUTO APPROVED</span>;
  return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">⚠ HUMAN REVIEW</span>;
}

function ConfBar({ score }) {
  const p   = Math.round((score||0)*100);
  const col = p>=80?"bg-emerald-500":p>=50?"bg-amber-500":"bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Confidence</span><span className="font-mono font-bold">{p}%</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <motion.div className={clsx("h-full rounded-full",col)}
          initial={{width:0}} animate={{width:`${p}%`}}
          transition={{duration:0.9,ease:"easeOut"}}/>
      </div>
    </div>
  );
}

function Field({ label, value, highlight }) {
  if (!value && value !== 0) return null;
  return (
    <div className="bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-700/50">
      <div className="text-xs text-gray-400 font-medium mb-0.5">{label}</div>
      <div className={clsx("text-sm font-semibold break-all",
        highlight ? "text-indigo-400" : "text-gray-100")}>{value}</div>
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div>
      <h4 className={clsx("text-xs font-bold uppercase tracking-widest mb-2", color)}>{title}</h4>
      {children}
    </div>
  );
}

/* ── Download helper ─────────────────────────────────────────── */
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(extracted, filename) {
  const rows = [["Field","Value"]];
  const skip = new Set(["_raw_ocr_text","_ocr_char_count","line_items","extraction_method"]);
  for (const [k,v] of Object.entries(extracted||{})) {
    if (!skip.has(k) && v !== null && v !== "") rows.push([k, String(v)]);
  }
  if ((extracted?.line_items||[]).length) {
    rows.push(["---LINE ITEMS---",""]);
    for (const item of extracted.line_items) {
      rows.push(["item", JSON.stringify(item)]);
    }
  }
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Result display ──────────────────────────────────────────── */
function ResultPanel({ result }) {
  const [tab, setTab] = useState("fields");
  const ex  = result.extracted_data || {};
  const aud = result.audit_report   || {};
  const tabs = ["fields","line_items","audit","raw_json"];
  const base = result.filename?.replace(/\.[^.]+$/,"") || "invoice";

  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
      className="space-y-5">

      {/* Summary header */}
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-100">Extraction Summary</h3>
            <p className="text-xs text-gray-400 mt-0.5">{result.filename} · {result.processing_time_seconds}s</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge routing={result.routing}/>
            {/* Download buttons */}
            <div className="flex gap-2">
              <button onClick={()=>downloadCSV(ex,`${base}_extracted.csv`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors">
                ⬇ CSV
              </button>
              <button onClick={()=>downloadJSON(result,`${base}_full_report.json`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-semibold transition-colors">
                ⬇ JSON
              </button>
            </div>
          </div>
        </div>
        <ConfBar score={result.confidence_score}/>

        {/* Key fields row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Invoice #"    value={ex.invoice_number} highlight/>
          <Field label="Date"         value={ex.invoice_date}/>
          <Field label="Total Amount" value={ex.total_amount} highlight/>
          <Field label="Currency"     value="₹ INR"/>
        </div>

        {/* Routing reasons */}
        {result.routing_reasons?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Routing Reasons</p>
            {result.routing_reasons.map((r,i)=>(
              <div key={i} className="flex gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-300">
                <span>⚠</span><span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={clsx("flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all",
              tab===t?"bg-indigo-600 text-white":"text-gray-400 hover:text-gray-200")}>
            {t.replace("_"," ")}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>

          {tab==="fields" && (
            <div className="space-y-5">
              <Section title="Vendor Information" color="text-indigo-400">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Vendor Name"    value={ex.vendor_name}/>
                  <Field label="Vendor GSTIN"   value={ex.vendor_gstin}/>
                  <Field label="Vendor PAN"     value={ex.vendor_pan}/>
                  <Field label="Vendor Phone"   value={ex.vendor_phone}/>
                  <Field label="Vendor Address" value={ex.vendor_address}/>
                </div>
              </Section>
              <Section title="Customer Information" color="text-violet-400">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Customer Name"    value={ex.customer_name}/>
                  <Field label="Customer GSTIN"   value={ex.customer_gstin}/>
                  <Field label="Customer Phone"   value={ex.customer_phone}/>
                  <Field label="Customer Address" value={ex.customer_address}/>
                </div>
              </Section>
              <Section title="Invoice Details" color="text-blue-400">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Invoice Number"  value={ex.invoice_number}/>
                  <Field label="Invoice Date"    value={ex.invoice_date}/>
                  <Field label="Due Date"        value={ex.due_date}/>
                  <Field label="Payment Terms"   value={ex.payment_terms}/>
                </div>
              </Section>
              <Section title="Amounts (INR ₹)" color="text-emerald-400">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Subtotal"      value={ex.subtotal}/>
                  <Field label="CGST"          value={ex.cgst_amount}/>
                  <Field label="SGST"          value={ex.sgst_amount}/>
                  <Field label="IGST"          value={ex.igst_amount}/>
                  <Field label="Total Tax"     value={ex.total_tax}/>
                  <Field label="Total Amount"  value={ex.total_amount} highlight/>
                </div>
                {ex.amount_in_words && (
                  <div className="mt-2 bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-700/50">
                    <div className="text-xs text-gray-400 mb-0.5">Amount in Words</div>
                    <div className="text-sm text-gray-200 italic">{ex.amount_in_words}</div>
                  </div>
                )}
              </Section>
              <Section title="Bank Details" color="text-amber-400">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Bank Name"       value={ex.bank_name}/>
                  <Field label="Account Number"  value={ex.account_number}/>
                  <Field label="IFSC Code"       value={ex.ifsc_code}/>
                </div>
              </Section>
            </div>
          )}

          {tab==="line_items" && (
            <div>
              {(ex.line_items||[]).length===0
                ? <div className="text-center py-12 text-gray-500 text-sm">No line items extracted</div>
                : <div className="overflow-x-auto rounded-xl border border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-800">
                        <tr>{["#","Description","Qty","Rate","Amount"].map(h=>(
                          <th key={h} className="px-4 py-3 text-left text-gray-300 font-semibold">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {ex.line_items.map((item,i)=>(
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                            <td className="px-4 py-3 text-gray-400">{i+1}</td>
                            <td className="px-4 py-3 text-gray-200">{item.description||item.name||JSON.stringify(item)}</td>
                            <td className="px-4 py-3 text-gray-300">{item.quantity||item.qty||"—"}</td>
                            <td className="px-4 py-3 text-gray-300">{item.rate||item.unit_price||"—"}</td>
                            <td className="px-4 py-3 text-indigo-400 font-semibold">{item.amount||item.total||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          )}

          {tab==="audit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-400">{Math.round((aud.overall_confidence||0)*100)}%</div>
                  <div className="text-xs text-gray-400 mt-1">Overall Confidence</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className={clsx("text-lg font-bold",
                    aud.audit_verdict==="PASS"?"text-emerald-400":
                    aud.audit_verdict==="REVIEW"?"text-amber-400":"text-red-400")}>
                    {aud.audit_verdict||"—"}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Audit Verdict</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-blue-400">{aud.ocr_quality||"—"}</div>
                  <div className="text-xs text-gray-400 mt-1">OCR Quality</div>
                </div>
              </div>

              {aud.critical_issues?.length>0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Critical Issues ({aud.critical_issues.length})</p>
                  {aud.critical_issues.map((i,idx)=>(
                    <div key={idx} className="flex gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
                      <span>✗</span><span>{i}</span>
                    </div>
                  ))}
                </div>
              )}
              {aud.warnings?.length>0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Warnings ({aud.warnings.length})</p>
                  {aud.warnings.map((w,idx)=>(
                    <div key={idx} className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
                      <span>⚠</span><span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {aud.reasoning && (
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Auditor Reasoning</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{aud.reasoning}</p>
                </div>
              )}
            </div>
          )}

          {tab==="raw_json" && (
            <div className="relative">
              <button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(result,null,2));toast.success("Copied!");}}
                className="absolute top-3 right-3 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors z-10">
                Copy
              </button>
              <pre className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-xs text-gray-300 overflow-x-auto max-h-[500px] leading-relaxed font-mono">
                {JSON.stringify(result,null,2)}
              </pre>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

/* ── AGENT STEPS for sidebar ─────────────────────────────────── */
const STEPS = [
  {key:"preprocessing", label:"Preprocessing Agent", icon:"🔬"},
  {key:"extracting",    label:"Extraction Agent",    icon:"📝"},
  {key:"auditing",      label:"Auditor Agent",        icon:"🔍"},
  {key:"validating",    label:"Validation Agent",    icon:"✅"},
  {key:"storing_rag",  label:"RAG Agent",            icon:"🧠"},
];

function Pipeline({ step, done }) {
  const idx = STEPS.findIndex(s=>s.key===step);
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Agent Pipeline</h3>
      <div className="space-y-3">
        {STEPS.map((s,i)=>{
          const active  = s.key===step && !done;
          const isDone  = done || i<idx;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className={clsx(
                "w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 transition-all",
                isDone ? "bg-emerald-500/20 text-emerald-400" :
                active ? "bg-indigo-500/30 text-indigo-300 ring-2 ring-indigo-500/50" :
                         "bg-gray-800 text-gray-600"
              )}>
                {isDone ? "✓" : s.icon}
              </div>
              <span className={clsx("text-sm font-medium transition-colors",
                active  ? "text-indigo-300" :
                isDone  ? "text-gray-400 line-through decoration-gray-600" :
                          "text-gray-600")}>
                {s.label}
              </span>
              {active && <div className="ml-auto w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Process Tab ─────────────────────────────────────────────── */
function ProcessTab() {
  const [file,       setFile]       = useState(null);
  const [language,   setLanguage]   = useState("auto");
  const [processing, setProcessing] = useState(false);
  const [step,       setStep]       = useState("");
  const [result,     setResult]     = useState(null);
  const wsRef = useRef(null);

  useEffect(()=>{
    const ws = new WebSocket("ws://localhost:8000/ws/progress");
    ws.onmessage = e => { try { setStep(JSON.parse(e.data).step); } catch{} };
    wsRef.current = ws;
    return () => ws.close();
  },[]);

  const {getRootProps,getInputProps,isDragActive} = useDropzone({
    accept:{"application/pdf":[".pdf"],"image/*":[".png",".jpg",".jpeg",".tiff",".tif",".bmp",".webp"]},
    maxFiles:1,
    onDrop: f => { if(f.length){setFile(f[0]);setResult(null);setStep("");} }
  });

  const run = async () => {
    if(!file) return;
    setProcessing(true); setResult(null); setStep("preprocessing");
    const fd = new FormData();
    fd.append("file",file); fd.append("language",language); fd.append("model","llama3");
    try {
      const res = await axios.post(`${API}/api/process`, fd,
        {headers:{"Content-Type":"multipart/form-data"}, timeout:600000});
      setResult(res.data);
      toast.success("Pipeline complete!");
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setProcessing(false); setStep("done");
    }
  };

  const langs = ["auto","english","hindi","tamil","telugu","bengali","marathi","gujarati","kannada","malayalam"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div {...getRootProps()} className={clsx(
            "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
            isDragActive ? "border-indigo-500 bg-indigo-500/10" :
            file         ? "border-emerald-500/60 bg-emerald-500/5" :
                           "border-gray-700 hover:border-gray-500 hover:bg-gray-800/40"
          )}>
            <input {...getInputProps()}/>
            <div className="text-5xl mb-3">{file?"📄":"📂"}</div>
            {file
              ? <div>
                  <p className="font-semibold text-emerald-400 text-lg">{file.name}</p>
                  <p className="text-sm text-gray-400 mt-1">{(file.size/1024).toFixed(1)} KB</p>
                </div>
              : <div>
                  <p className="font-semibold text-gray-300 text-lg">{isDragActive?"Drop it here":"Drag & drop your invoice"}</p>
                  <p className="text-sm text-gray-500 mt-1">PDF · PNG · JPG · JPEG · TIFF · BMP · WEBP</p>
                </div>
            }
          </div>

          <div className="flex gap-3">
            <select value={language} onChange={e=>setLanguage(e.target.value)}
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {langs.map(l=><option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
            </select>
            <button onClick={run} disabled={!file||processing}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all">
              {processing
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Processing…</>
                : <>🚀 Run Pipeline</>}
            </button>
            {file && <button onClick={()=>{setFile(null);setResult(null);setStep("");}}
              className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm font-medium transition-colors">✕</button>}
          </div>
        </div>

        <Pipeline step={step} done={!processing && !!result}/>
      </div>

      {result && <ResultPanel result={result}/>}
    </div>
  );
}

/* ── Chat Tab ────────────────────────────────────────────────── */
function ChatTab() {
  const [history, setHistory] = useState([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const examples  = [
    "What was the total amount of the last invoice?",
    "List all vendor names processed so far",
    "Which invoices were flagged for human review?",
    "What GSTIN numbers were extracted?",
    "Summarise all audit findings",
  ];

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[history]);

  const send = async msg => {
    const text = msg||input.trim(); if(!text) return;
    setInput(""); setLoading(true);
    const next = [...history,[text,null]];
    setHistory(next);
    try {
      const res = await axios.post(`${API}/api/chat`,
        {message:text, history:history.filter(h=>h[1]!==null)});
      setHistory(h=>h.map((item,i)=>i===h.length-1?[item[0],res.data.response]:item));
    } catch(e) {
      setHistory(h=>h.map((item,i)=>i===h.length-1?[item[0],`Error: ${e.message}`]:item));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-gray-100">🧠 Invoice RAG Assistant</h3>
          <p className="text-xs text-gray-400 mt-0.5">Answers grounded in your processed invoice data via ChromaDB</p>
        </div>
        <div className="flex flex-col" style={{height:"420px"}}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {history.length===0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">💬</div>
                <p className="text-sm">Process an invoice first, then ask anything about it</p>
              </div>
            )}
            {history.map(([user,bot],i)=>(
              <div key={i} className="space-y-2">
                <div className="flex justify-end">
                  <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-[80%]">{user}</div>
                </div>
                {bot!==null
                  ? <div className="flex justify-start">
                      <div className="bg-gray-800 text-gray-200 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm max-w-[85%] whitespace-pre-wrap">{bot}</div>
                    </div>
                  : loading && i===history.length-1 &&
                    <div className="flex justify-start">
                      <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                        {[0,1,2].map(d=><div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${d*0.15}s`}}/>)}
                      </div>
                    </div>
                }
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          <div className="p-4 border-t border-gray-800 flex gap-2">
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
              placeholder="Ask about your invoices…"
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}/>
            <button onClick={()=>send()} disabled={!input.trim()||loading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium">Try asking:</p>
        <div className="flex flex-wrap gap-2">
          {examples.map(e=>(
            <button key={e} onClick={()=>send(e)}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors">
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Stats Tab ───────────────────────────────────────────────── */
function StatsTab() {
  const [s, setS] = useState(null);
  useEffect(()=>{
    axios.get(`${API}/api/stats`).then(r=>setS(r.data)).catch(()=>setS({error:"Could not load"}));
  },[]);
  const cards = [
    {label:"Total Processed", value:s?.total_invoices??0,     icon:"📄", color:"text-indigo-400"},
    {label:"Auto Approved",   value:s?.auto_approved??0,      icon:"✅", color:"text-emerald-400"},
    {label:"Human Review",    value:s?.human_review??0,       icon:"⚠️", color:"text-amber-400"},
    {label:"Avg Confidence",  value:s?.avg_confidence?`${(s.avg_confidence*100).toFixed(1)}%`:"—", icon:"📊", color:"text-blue-400"},
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c=>(
        <div key={c.label} className="bg-gray-900 rounded-2xl border border-gray-700 p-6 text-center">
          <div className="text-4xl mb-2">{c.icon}</div>
          <div className={clsx("text-3xl font-bold",c.color)}>{c.value}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Architecture Tab ────────────────────────────────────────── */
function ArchTab() {
  const agents = [
    {icon:"🔬",name:"Preprocessing Agent",color:"border-violet-700/50 bg-violet-500/5",
     steps:["Upscale small images 2x","FastNlMeans denoising","deskew via minAreaRect","CLAHE contrast enhancement","Otsu + adaptive binarize"]},
    {icon:"📝",name:"Extraction Agent",color:"border-blue-700/50 bg-blue-500/5",
     steps:["Tesseract OCR (10+ languages)","Multi-PSM mode voting","Ollama LLM field parsing","INR currency normalisation","Regex fallback pipeline"]},
    {icon:"🔍",name:"Auditor Agent",color:"border-amber-700/50 bg-amber-500/5",
     steps:["GSTIN format validation","Math cross-check (subtotal+tax=total)","Date plausibility checks","IFSC format validation","LLM adversarial scoring (0–1)"]},
    {icon:"✅",name:"Validation Agent",color:"border-rose-700/50 bg-rose-500/5",
     steps:["Threshold routing (0.80)","AUTO_APPROVED / HUMAN_REVIEW","Hard-block on critical issues","Routing reason logging"]},
    {icon:"🧠",name:"RAG Chatbot Agent",color:"border-emerald-700/50 bg-emerald-500/5",
     steps:["ChromaDB persistent store","nomic-embed-text embeddings","Cosine similarity retrieval","Context-grounded Ollama answers","Conversation history support"]},
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(a=>(
          <div key={a.name} className={clsx("rounded-2xl border p-5 space-y-3",a.color)}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{a.icon}</span>
              <h3 className="font-bold text-sm text-gray-200">{a.name}</h3>
            </div>
            <ul className="space-y-1.5">
              {a.steps.map(s=>(
                <li key={s} className="flex gap-2 text-xs text-gray-400">
                  <span className="text-gray-600 flex-shrink-0">›</span>{s}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Root App ────────────────────────────────────────────────── */
export default function App() {
  const [dark, setDark] = useDark();
  const [tab,  setTab]  = useState("Process");
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 transition-colors">
      <Toaster position="top-right" toastOptions={{className:"bg-gray-800 text-white text-sm"}}/>
      <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">🧾</div>
            <div>
              <h1 className="font-bold text-base text-gray-100">OCR Audit Pipeline</h1>
              <p className="text-xs text-gray-500">Multi-Agent · FOSS · Local LLM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="hidden sm:flex bg-gray-800 rounded-xl p-1 gap-1">
              {TABS.map(t=>(
                <button key={t} onClick={()=>setTab(t)}
                  className={clsx("px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                    tab===t?"bg-indigo-600 text-white shadow":"text-gray-400 hover:text-gray-200")}>
                  {t}
                </button>
              ))}
            </nav>
            <button onClick={()=>setDark(d=>!d)}
              className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-lg hover:bg-gray-700 transition-colors">
              {dark?"☀️":"🌙"}
            </button>
          </div>
        </div>
        <div className="sm:hidden flex border-t border-gray-800">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={clsx("flex-1 py-2 text-xs font-medium",
                tab===t?"text-indigo-400 border-b-2 border-indigo-500":"text-gray-500")}>
              {t}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
            exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
            {tab==="Process"      && <ProcessTab/>}
            {tab==="Chat"         && <ChatTab/>}
            {tab==="Stats"        && <StatsTab/>}
            {tab==="Architecture" && <ArchTab/>}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
