import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConfidenceBar, RoutingBadge, StatCard } from "../components/invoiceUi";
import { formatCurrency, invoices } from "../data/invoices";

const approvalData = [
  { name: "Auto approved", value: invoices.filter((invoice) => invoice.routing === "AUTO_APPROVED").length, color: "#34d399" },
  { name: "Human review", value: invoices.filter((invoice) => invoice.routing === "HUMAN_REVIEW").length, color: "#f59e0b" },
];

const confidenceBuckets = [
  { bucket: "50-60", count: invoices.filter((invoice) => invoice.confidence >= 0.5 && invoice.confidence < 0.6).length },
  { bucket: "60-70", count: invoices.filter((invoice) => invoice.confidence >= 0.6 && invoice.confidence < 0.7).length },
  { bucket: "70-80", count: invoices.filter((invoice) => invoice.confidence >= 0.7 && invoice.confidence < 0.8).length },
  { bucket: "80-90", count: invoices.filter((invoice) => invoice.confidence >= 0.8 && invoice.confidence < 0.9).length },
  { bucket: "90-100", count: invoices.filter((invoice) => invoice.confidence >= 0.9).length },
];

export default function Statistics() {
  const autoApproved = approvalData[0].value;
  const review = approvalData[1].value;
  const avgConfidence = invoices.reduce((sum, invoice) => sum + invoice.confidence, 0) / invoices.length;
  const totalValue = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Stats</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-100">Operations Dashboard</h1>
        <p className="mt-2 text-sm text-gray-400">Routing mix, confidence quality, and the latest documents from the invoice pipeline.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total processed" value={invoices.length} tone="text-indigo-300" />
        <StatCard label="Auto approved" value={autoApproved} tone="text-emerald-300" />
        <StatCard label="Human review" value={review} tone="text-amber-300" />
        <StatCard label="Invoice value" value={formatCurrency(totalValue)} tone="text-sky-300" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Routing Split</h2>
            <span className="text-sm text-gray-400">{Math.round(avgConfidence * 100)}% avg confidence</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={approvalData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={4}>
                  {approvalData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {approvalData.map((entry) => (
              <div key={entry.name} className="rounded-lg bg-gray-950 p-3">
                <p className="text-sm text-gray-400">{entry.name}</p>
                <p className="mt-1 text-2xl font-bold text-gray-100">{entry.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-semibold text-gray-100">Confidence Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={confidenceBuckets}>
                <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#9ca3af" fontSize={12} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#818cf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-100">Recent Documents</h2>
          <Link to="/history" className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">View all</Link>
        </div>
        <div className="divide-y divide-gray-800">
          {invoices.slice(0, 6).map((invoice) => (
            <Link key={invoice.id} to="/history" className="grid gap-3 px-5 py-4 hover:bg-gray-900 md:grid-cols-[1fr_160px_180px_150px] md:items-center">
              <div>
                <p className="font-semibold text-gray-100">{invoice.invoiceNumber} · {invoice.seller}</p>
                <p className="mt-1 text-sm text-gray-500">{invoice.filename}</p>
              </div>
              <p className="font-semibold text-gray-200">{formatCurrency(invoice.amount)}</p>
              <ConfidenceBar value={invoice.confidence} compact />
              <RoutingBadge routing={invoice.routing} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
