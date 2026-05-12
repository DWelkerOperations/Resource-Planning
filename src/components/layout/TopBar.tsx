import { CalendarDays, ChevronDown, Users, Truck, Activity } from "lucide-react";
import { ScheduleImporter } from "../import/ScheduleImporter";
import { KpiCard } from "../ui/KpiCard";
import type { FlightAssignment } from "../../types/dispatch";

type TopBarProps = {
  importedFileName?: string;
  importedFlightCount?: number;
  onScheduleImport: (flights: FlightAssignment[], fileName: string) => void;
};

export function TopBar({ importedFileName, importedFlightCount, onScheduleImport }: TopBarProps) {
  return (
    <header className="no-print border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Driver Pairing Planner</h1>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-500">ORD</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Friday, Jan 23, 2026 · Morning dispatch plan</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <KpiCard label="Drivers Required" value="24" icon={<Users size={19} />} />
          <KpiCard label="Max Trucks Needed" value="18" icon={<Truck size={19} />} />
          <KpiCard label="Flights Covered" value="156" icon={<Activity size={19} />} />
          <KpiCard label="Avg Utilization" value="71%" icon={<Activity size={19} />} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
          <CalendarDays size={18} />
          Jan 23, 2026
          <ChevronDown size={16} />
        </button>
        <button className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
          Scenario 1 · Default Rules
          <ChevronDown size={16} />
        </button>
        <ScheduleImporter onImport={onScheduleImport} />
        {importedFileName && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {importedFlightCount} imported · {importedFileName}
          </div>
        )}
      </div>
    </header>
  );
}
