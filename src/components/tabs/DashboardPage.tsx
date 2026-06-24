import { AlertTriangle, Clock3, Plane, TrendingUp, Truck, Users } from "lucide-react";
import { KpiCard } from "../ui/KpiCard";
import { Panel } from "../ui/Panel";

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h2><p className="mt-1 text-sm text-slate-500">Mock summary for the active dispatch plan.</p></div>
      <div className="grid grid-cols-6 gap-4">
        <KpiCard label="Drivers Required" value="24" helper="Morning bank" icon={<Users size={20} />} />
        <KpiCard label="Max Trucks Needed" value="18" helper="Peak at 09:15" icon={<Truck size={20} />} />
        <KpiCard label="Utilization" value="71%" helper="Planned shift use" icon={<TrendingUp size={20} />} />
        <KpiCard label="OT Hours" value="4.6" helper="Projected" icon={<Clock3 size={20} />} />
        <KpiCard label="Flights Covered" value="156" helper="98% covered" icon={<Plane size={20} />} />
        <KpiCard label="Exceptions" value="5" helper="2 high priority" icon={<AlertTriangle size={20} />} />
      </div>
      <Panel className="p-5"><h3 className="text-base font-semibold text-ink">Operational Snapshot</h3><p className="mt-2 text-sm leading-6 text-slate-600">Morning coverage is stable. Main attention areas are lunch gaps, one truck overlap, and a late unplanned UA flight.</p></Panel>
    </div>
  );
}
