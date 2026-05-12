import { useMemo, useState } from "react";
import { mockDrivers } from "../../data/mockDrivers";
import { mockFlights } from "../../data/mockFlights";
import { mockHelpers, mockTrucks } from "../../data/mockResources";
import { createDispatchSchedule } from "../../engine/scheduler";
import type { FlightAssignment, ResourceInputs } from "../../types/dispatch";
import { Panel } from "../ui/Panel";
import { ExceptionTable, PushTable, ScheduleSummaryCards } from "./scheduleUi";

export function DispatchToolPage({ flights = mockFlights }: { flights?: FlightAssignment[] }) {
  const [draftDrivers, setDraftDrivers] = useState(4);
  const [draftHelpers, setDraftHelpers] = useState(1);
  const [draftTrucks, setDraftTrucks] = useState(3);
  const [resources, setResources] = useState<ResourceInputs>({
    availableDrivers: 4,
    availableHelpers: 1,
    availableTrucks: 3,
  });

  const result = useMemo(
    () => createDispatchSchedule(flights, mockDrivers, mockHelpers, mockTrucks, resources),
    [flights, resources],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Day-to-Day Dispatch Tool</h2>
        <p className="mt-1 text-sm text-slate-500">Live operations mode. Enter available resources to see the best achievable push plan.</p>
      </div>
      <Panel className="p-5">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-4">
          <ResourceInput label="Available Drivers" value={draftDrivers} onChange={setDraftDrivers} />
          <ResourceInput label="Available Helpers" value={draftHelpers} onChange={setDraftHelpers} />
          <ResourceInput label="Available Trucks" value={draftTrucks} onChange={setDraftTrucks} />
          <button
            onClick={() => setResources({ availableDrivers: draftDrivers, availableHelpers: draftHelpers, availableTrucks: draftTrucks })}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            Refresh Pairings
          </button>
        </div>
      </Panel>
      <ScheduleSummaryCards result={result} />
      {result.resourceBottlenecks.length > 0 && <Panel className="p-5"><h3 className="text-base font-semibold text-ink">Resource Bottleneck Explanation</h3><div className="mt-3 flex flex-wrap gap-2">{result.resourceBottlenecks.map((bottleneck) => <span key={bottleneck} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">{bottleneck}</span>)}</div></Panel>}
      <PushTable result={result} />
      <ExceptionTable exceptions={result.exceptions} />
    </div>
  );
}

function ResourceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input min={0} max={40} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}
