import { normalizeAirportCode, sampleAirportOptions } from "../../data/airports";
import { appBranding } from "../../config/appBranding";
import type { ReferenceSchedule } from "../../data/referenceSchedules";
import { ScheduleImporter } from "../import/ScheduleImporter";
import type { AirportCode, FlightAssignment } from "../../types/dispatch";

type TopBarProps = {
  activeAirport: AirportCode;
  hasCustomSchedule: boolean;
  importedFileName?: string;
  importedFlightCount?: number;
  referenceSchedules: ReferenceSchedule[];
  selectedReferenceScheduleId: string;
  visibleFlightCount: number;
  onAirportChange: (airport: AirportCode) => void;
  onCustomScheduleLoad: () => void;
  onReferenceScheduleLoad: (schedule: ReferenceSchedule) => void;
  onScheduleClear: () => void;
  onScheduleImport: (flights: FlightAssignment[], fileName: string, selectedDate?: string) => void;
};

export function TopBar({
  activeAirport,
  hasCustomSchedule,
  importedFileName,
  importedFlightCount,
  referenceSchedules,
  selectedReferenceScheduleId,
  visibleFlightCount,
  onAirportChange,
  onCustomScheduleLoad,
  onReferenceScheduleLoad,
  onScheduleClear,
  onScheduleImport,
}: TopBarProps) {
  const scheduleLabel = importedFileName
    ? `Active Schedule: ${importedFileName} · ${visibleFlightCount} ${activeAirport} flights shown of ${importedFlightCount} loaded`
    : `Active Schedule: Sample ${activeAirport} flight schedule`;

  return (
    <header className="no-print border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
      <div className="mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{appBranding.productName}</h1>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-500">{activeAirport}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{scheduleLabel}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
          Site
          <select
            value={activeAirport}
            onChange={(event) => {
              const airport = normalizeAirportCode(event.target.value);
              if (airport) onAirportChange(airport);
            }}
            className="bg-transparent text-sm font-semibold text-ink outline-none"
          >
            {!sampleAirportOptions.includes(activeAirport) && <option value={activeAirport}>{activeAirport}</option>}
            {sampleAirportOptions.map((airport) => <option key={airport} value={airport}>{airport}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
          Reference File
          <select
            value={selectedReferenceScheduleId}
            onChange={(event) => {
              if (event.target.value === "") {
                onCustomScheduleLoad();
                return;
              }

              const schedule = referenceSchedules.find((item) => item.id === event.target.value);
              if (schedule) onReferenceScheduleLoad(schedule);
            }}
            className="bg-transparent text-sm font-semibold text-ink outline-none"
          >
            <option value="" disabled={!hasCustomSchedule && selectedReferenceScheduleId !== ""}>Imported / custom</option>
            {referenceSchedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}
          </select>
        </label>
        <ScheduleImporter onImport={onScheduleImport} />
        <button
          type="button"
          onClick={onScheduleClear}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Clear Schedule
        </button>
      </div>
    </header>
  );
}
