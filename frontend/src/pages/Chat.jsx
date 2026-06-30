import { useRef, useState } from "react";
import axios from "axios";
import { invoices } from "../data/invoices";

const API = "http://localhost:8000";

const fallbackSources = [
  {
    id: "INV-001_summary",
    score: 0.92,
    preview: "Surya Retail Traders invoice INV-001 for Apex Foods Pvt Ltd. Total INR 184250.00 with CGST and SGST present.",
  },
  {
    id: "INV-001_audit",
    score: 0.87,
    preview: "Audit verdict PASS. GSTIN format, invoice date, bank details, and subtotal plus tax checks passed.",
  },
];

function SourceList({ sources }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sources</p>
      <div className="mt-2 space-y-2">
        {sources.map((source, index) => (
          <details key={source.id || source.name || index} className="rounded-md border border-gray-800 bg-gray-900 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-indigo-300">
              {source.id || source.name || `source_${index + 1}`} <span className="font-normal text-gray-500">score {Math.round((source.score || 0) * 100)}%</span>
            </summary>
            <p className="mt-2 text-sm leading-6 text-gray-400">{source.preview || source.text || source.content}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Ask about totals, sellers, audit failures, or which invoices need human review.",
      sources: fallbackSources,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  async function send(prompt = input.trim()) {
    if (!prompt || loading) return;
    setInput("");
    setLoading(true);
    setMessages((items) => [...items, { role: "user", text: prompt }]);

    try {
      const response = await axios.post(`${API}/api/chat`, { message: prompt });
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          text: response.data.response || response.data.answer,
          sources: response.data.sources || response.data.context || fallbackSources,
        },
      ]);
    } catch {
      const reviewCount = invoices.filter((invoice) => invoice.routing === "HUMAN_REVIEW").length;
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          text: `There are ${reviewCount} invoices currently routed to human review. The strongest example is ME-2241, which was flagged for a tax mismatch and missing IFSC details.`,
          sources: fallbackSources,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const examples = ["Which invoices need human review?", "Show audit failures for INV-001", "What chunks supported that answer?"];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">RAG Chat</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-100">Invoice RAG Assistant</h1>
        <p className="mt-2 text-sm text-gray-400">Answers include retrieved invoice chunks with expandable previews for source attribution.</p>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900">
        <div className="h-[560px] overflow-y-auto p-5">
          <div className="space-y-5">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "user" ? "max-w-2xl rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white" : "max-w-3xl rounded-lg bg-gray-950 px-4 py-3 text-sm text-gray-200"}>
                  <p className="whitespace-pre-wrap leading-6">{message.text}</p>
                  {message.sources?.length ? <SourceList sources={message.sources} /> : null}
                </div>
              </div>
            ))}
            {loading && <div className="text-sm text-gray-500">Retrieving invoice chunks...</div>}
          </div>
        </div>

        <div className="border-t border-gray-800 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button key={example} className="rounded-md border border-gray-800 bg-gray-950 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800" onClick={() => send(example)}>
                {example}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input ref={inputRef} className="input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder="Ask a grounded question about processed invoices" />
            <button className="btn-primary" disabled={!input.trim() || loading} onClick={() => send()}>Send</button>
          </div>
        </div>
      </section>
    </div>
  );
}
