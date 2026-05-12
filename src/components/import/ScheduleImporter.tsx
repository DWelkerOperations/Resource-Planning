import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { parseScheduleFile } from "../../import/scheduleImport";
import type { FlightAssignment } from "../../types/dispatch";

type ScheduleImporterProps = {
  onImport: (flights: FlightAssignment[], fileName: string) => void;
};

export function ScheduleImporter({ onImport }: ScheduleImporterProps) {
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const flights = await parseScheduleFile(file);
    onImport(flights, file.name);
    event.target.value = "";
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50">
      Import Schedule
      <Upload size={17} />
      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
    </label>
  );
}
