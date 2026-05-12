type KpiCardProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: React.ReactNode;
};

export function KpiCard({ label, value, helper, icon }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        <div className="text-slate-400">{icon}</div>
      </div>
      {helper && <p className="mt-2 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}
