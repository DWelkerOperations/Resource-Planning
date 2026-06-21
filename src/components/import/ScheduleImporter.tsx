import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import type { FlightAssignment } from "../../types/dispatch";
import type { NormalizedScheduleRow, ScheduleImportResult } from "../../import/scheduleImport";

type ScheduleImporterProps = {
  onImport: (flights: FlightAssignment[], fileName: string) => void;
};

type PendingSchedule = ScheduleImportResult & {
  fileName: string;
};

export function ScheduleImporter({ onImport }: ScheduleImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportError(null);
      setImportWarning(null);
      setPendingSchedule(null);
      const { parseScheduleFile } = await import("../../import/scheduleImport");
      const result = await parseScheduleFile(file);
      setPendingSchedule({ ...result, fileName: file.name });
      setImportWarning(importSummary(result));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read schedule file.");
      setImportWarning(null);
    } finally {
      event.target.value = "";
    }
  }

  function confirmImport() {
    if (!pendingSchedule) return;
    onImport(pendingSchedule.flights, pendingSchedule.fileName);
    setImportWarning(`${pendingSchedule.flights.length} normalized rows confirmed and loaded.`);
    setPendingSchedule(null);
  }

  function cancelImport() {
    setPendingSchedule(null);
    setImportWarning(null);
    setImportError(null);
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Import Schedule
          <Upload size={17} />
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={handleFileChange} tabIndex={-1} />
        {importError && <span className="text-xs font-medium text-red-600">{importError}</span>}
        {!importError && importWarning && <span className="max-w-xl text-xs font-medium text-amber-700">{importWarning}</span>}
      </div>
      {pendingSchedule && (
        <div className="mt-3 max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Review normalized schedule before loading</p>
              <p className="mt-1 text-xs text-slate-600">
                {pendingSchedule.fileName} · Format: {formatLabel(pendingSchedule.detectedFormat)} · {pendingSchedule.normalizedRows.length} valid · {pendingSchedule.skippedRowCount} skipped
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={cancelImport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={confirmImport} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Use This Schedule
              </button>
            </div>
          </div>
          {pendingSchedule.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-2 text-xs text-amber-800">
              {pendingSchedule.warnings.slice(0, 4).map((warning) => <div key={warning}>{warning}</div>)}
              {pendingSchedule.warnings.length > 4 && <div>{pendingSchedule.warnings.length - 4} more warning(s).</div>}
            </div>
          )}
          <NormalizedPreview rows={pendingSchedule.normalizedRows} />
        </div>
      )}
    </div>
  );
}

function importSummary(result: ScheduleImportResult) {
  const warningText = result.warnings.length > 0
    ? ` ${result.warnings.length} warning(s): ${result.warnings.slice(0, 2).join(" ")}${result.warnings.length > 2 ? ` ${result.warnings.length - 2} more.` : ""}`
    : "";
  return `Detected ${formatLabel(result.detectedFormat)}. ${result.normalizedRows.length} valid row(s), ${result.skippedRowCount} skipped.${warningText}`;
}

function formatLabel(format: ScheduleImportResult["detectedFormat"]) {
  return {
    standard: "standard airline schedule",
    "combined-flight": "combined flight schedule",
    "operation-plan": "operation plan schedule",
  }[format];
}

function NormalizedPreview({ rows }: { rows: NormalizedScheduleRow[] }) {
  const previewRows = rows.slice(0, 8);

  return (
    <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="border-b border-slate-200 px-3 py-2">Row</th>
            <th className="border-b border-slate-200 px-3 py-2">Date</th>
            <th className="border-b border-slate-200 px-3 py-2">Flight</th>
            <th className="border-b border-slate-200 px-3 py-2">ETD</th>
            <th className="border-b border-slate-200 px-3 py-2">Aircraft</th>
            <th className="border-b border-slate-200 px-3 py-2">Site</th>
            <th className="border-b border-slate-200 px-3 py-2">Destination</th>
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row) => (
            <tr key={`${row.sourceRowNumber}-${row.airline}-${row.flightNumber}`} className="odd:bg-white even:bg-slate-50/60">
              <td className="border-b border-slate-100 px-3 py-2 text-slate-500">{row.sourceRowNumber}</td>
              <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.departureDate}</td>
              <td className="border-b border-slate-100 px-3 py-2 font-semibold text-ink">{row.airline}{row.flightNumber}</td>
              <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.departureTime}</td>
              <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.aircraftType}</td>
              <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.originSite}</td>
              <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.destination}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > previewRows.length && <div className="px-3 py-2 text-xs font-medium text-slate-500">{rows.length - previewRows.length} more normalized row(s) not shown.</div>}
    </div>
  );
}
