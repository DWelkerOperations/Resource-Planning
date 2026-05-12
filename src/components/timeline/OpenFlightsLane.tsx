import type { FlightAssignment } from "../../types/dispatch";
import { FlightPuck } from "./FlightPuck";
import { rowHeight, timelineWidth } from "./timelineUtils";

export function OpenFlightsLane({ flights }: { flights: FlightAssignment[] }) {
  return (
    <div className="flex border-t border-slate-200 bg-white">
      <div className="flex w-[380px] shrink-0 items-center justify-between border-r border-slate-200 px-6 text-sm font-semibold text-ink">
        <span>Unplanned / Open</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{flights.length}</span>
      </div>
      <div className="relative bg-slate-50" style={{ height: rowHeight * 2.3, width: timelineWidth() }}>
        {flights.map((flight, index) => <div key={flight.id} className="absolute left-0" style={{ top: index * 26 + 10 }}><FlightPuck flight={flight} /></div>)}
      </div>
    </div>
  );
}
