import { useMemo, useState } from "react";
import { AuditBadge, ConfidenceBar, Field, RoutingBadge, downloadCSV } from "../components/invoiceUi";
import { formatCurrency, invoices } from "../data/invoices";

export default function History() {
  const [query, setQuery] = useState("");
  const [routing, setRouting] = useState("ALL");
  const [selected, setSelected] = useState(invoices[0]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesRouting = routing === "ALL" || invoice.routing === routing;
      const matchesQuery = !needle || [invoice.seller, invoice.invoiceNumber, invoice.filename].some((value) => value?.toLowerCase().includes(needle));
      return matchesRouting && matchesQuery;
    });
  }, [query, routing]);

  function exportRows() {
    downloadCSV(
      [
        ["filename", "invoice_number", "seller", "amount", "confidence", "routing"],
        ...filtered.map((invoice) => [invoice.filename, invoice.invoiceNumber, invoice.seller, formatCurrency(invoice.amount), `${Math.round(invoice.confidence * 100)}%`, invoice.routing]),
      ],
      "invoice-history.csv",
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">History</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-100">Processed Documents</h1>
          <p className="mt-2 text-sm text-gray-400">All 15 processed invoices with search, routing filters, and quick result actions.</p>
        </div>
        <button className="btn-primary" onClick={exportRows}>Export CSV</button>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search seller, invoice number, or filename" />
          <select className="input" value={routing} onChange={(event) => setRouting(event.target.value)}>
            <option value="ALL">All routing</option>
            <option value="AUTO_APPROVED">Auto approved</option>
            <option value="HUMAN_REVIEW">Human review</option>
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Routing</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-gray-900/70">
                <td className="px-4 py-4 font-medium text-gray-100">{invoice.filename}</td>
                <td className="px-4 py-4 text-gray-300">{invoice.invoiceNumber}</td>
                <td className="px-4 py-4 text-gray-300">{invoice.seller}</td>
                <td className="px-4 py-4 font-semibold text-gray-100">{formatCurrency(invoice.amount)}</td>
                <td className="px-4 py-4"><ConfidenceBar value={invoice.confidence} compact /></td>
                <td className="px-4 py-4"><RoutingBadge routing={invoice.routing} /></td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <button className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700" onClick={() => setSelected(invoice)}>Open</button>
                    <button className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700" onClick={() => setSelected(invoice)}>Audit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="p-10 text-center text-sm text-gray-500">No documents match the current filters.</div>}
      </section>

      {selected && (
        <section className="grid gap-5 rounded-lg border border-gray-800 bg-gray-950 p-5 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Selected result</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-100">{selected.invoiceNumber} · {selected.seller}</h2>
                <p className="mt-1 text-sm text-gray-400">{selected.filename}</p>
              </div>
              <RoutingBadge routing={selected.routing} size="lg" />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Field label="Amount" value={formatCurrency(selected.amount)} />
              <Field label="Date" value={selected.date} />
              <Field label="Status" value={selected.status} />
            </div>
          </div>
          <div>
            <ConfidenceBar value={selected.confidence} />
            <div className="mt-4 space-y-2">
              {(selected.audit || []).slice(0, 3).map((item) => (
                <div key={`${selected.id}-${item.rule}`} className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <AuditBadge result={item.result} />
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{item.rule}</p>
                    <p className="text-xs text-gray-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
