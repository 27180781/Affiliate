export default function KpiCard({ label, value, hint, accent = 'brand' }) {
  const accents = {
    brand: 'text-brand-600 bg-brand-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {hint ? (
        <span className={`mt-1 w-fit rounded-md px-2 py-0.5 text-xs ${accents[accent]}`}>{hint}</span>
      ) : null}
    </div>
  );
}
