import type { ReferenceSchedule } from "../../data/referenceSchedules";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { AirportCode, AppTab, FlightAssignment } from "../../types/dispatch";

type AppShellProps = {
  activeTab: AppTab;
  activeAirport: AirportCode;
  onTabChange: (tab: AppTab) => void;
  importedFileName?: string;
  importedFlightCount?: number;
  referenceSchedules: ReferenceSchedule[];
  selectedReferenceScheduleId: string;
  visibleFlightCount: number;
  onAirportChange: (airport: AirportCode) => void;
  onReferenceScheduleLoad: (schedule: ReferenceSchedule) => void;
  onScheduleClear: () => void;
  onScheduleImport: (flights: FlightAssignment[], fileName: string, selectedDate?: string) => void;
  children: React.ReactNode;
};

export function AppShell({
  activeTab,
  activeAirport,
  onTabChange,
  importedFileName,
  importedFlightCount,
  referenceSchedules,
  selectedReferenceScheduleId,
  visibleFlightCount,
  onAirportChange,
  onReferenceScheduleLoad,
  onScheduleClear,
  onScheduleImport,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-mist p-3">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-soft">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex min-w-0 flex-1 flex-col bg-slate-50/70">
          <TopBar
            activeAirport={activeAirport}
            importedFileName={importedFileName}
            importedFlightCount={importedFlightCount}
            referenceSchedules={referenceSchedules}
            selectedReferenceScheduleId={selectedReferenceScheduleId}
            visibleFlightCount={visibleFlightCount}
            onAirportChange={onAirportChange}
            onReferenceScheduleLoad={onReferenceScheduleLoad}
            onScheduleClear={onScheduleClear}
            onScheduleImport={onScheduleImport}
          />
          <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
          <footer className="border-t border-slate-200 bg-white/80 px-5 py-3 text-xs text-slate-500">
            V{__APP_VERSION__} Resource Planning | Commit {__BUILD_COMMIT__} | Built{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(__BUILD_TIMESTAMP__))}
          </footer>
        </main>
      </div>
    </div>
  );
}
