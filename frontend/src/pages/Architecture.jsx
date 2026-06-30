import clsx from "clsx";

const agents = [
  {
    name: "Preprocessing",
    tone: "border-violet-500/30 bg-violet-500/10",
    owner: "Surya / image ops",
    steps: ["Image normalization", "Deskew and denoise", "Contrast enhancement", "Preprocessed preview"],
  },
  {
    name: "OCR",
    tone: "border-sky-500/30 bg-sky-500/10",
    owner: "OCR engine",
    steps: ["Multi-language detection", "Raw text capture", "Token confidence scoring", "Debug text viewer"],
  },
  {
    name: "Extraction",
    tone: "border-indigo-500/30 bg-indigo-500/10",
    owner: "LLM parser",
    steps: ["Invoice field schema", "Line-item parsing", "JSON repair fallback", "Timeout retry state"],
  },
  {
    name: "Audit",
    tone: "border-amber-500/30 bg-amber-500/10",
    owner: "Rules + LLM judge",
    steps: ["GSTIN validation", "Tax math checks", "Date plausibility", "PASS/FAIL findings"],
  },
  {
    name: "Routing",
    tone: "border-emerald-500/30 bg-emerald-500/10",
    owner: "Policy engine",
    steps: ["Confidence threshold", "Critical issue block", "Auto approve", "Human review queue"],
  },
  {
    name: "RAG Store",
    tone: "border-rose-500/30 bg-rose-500/10",
    owner: "Vector index",
    steps: ["Summary chunk", "Audit chunk", "OCR chunk", "Source-attributed chat"],
  },
];

export default function Architecture() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Architecture</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-100">Pipeline Map</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-400">The invoice flow is grouped by operational responsibility so failures, audit decisions, and RAG attribution have obvious ownership.</p>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          {agents.map((agent, index) => (
            <div key={agent.name} className={clsx("rounded-lg border p-4", agent.tone)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step {index + 1}</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-100">{agent.name}</h2>
                </div>
                <span className="rounded-full bg-gray-950 px-3 py-1 text-xs font-semibold text-gray-300">{agent.owner}</span>
              </div>
              <ul className="mt-4 space-y-2">
                {agent.steps.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Failure handling", "Surya failures, LLM timeouts, and indexing issues surface in Process debug states."],
          ["Audit trail", "Every routed document keeps rule findings, confidence, OCR text, and raw JSON exports."],
          ["Source grounding", "Chat answers cite summary, audit, and OCR chunks so users can inspect retrieval context."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <h3 className="font-semibold text-gray-100">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
