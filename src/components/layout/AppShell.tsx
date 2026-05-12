import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { AppTab, FlightAssignment } from "../../types/dispatch";

type AppShellProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  importedFileName?: string;
  importedFlightCount?: number;
  onScheduleImport: (flights: FlightAssignment[], fileName: string) => void;
  children: React.ReactNode;
};

export function AppShell({ activeTab, onTabChange, importedFileName, importedFlightCount, onScheduleImport, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-mist p-3">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-soft">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex min-w-0 flex-1 flex-col bg-slate-50/70">
          <TopBar
            activeTab={activeTab}
            importedFileName={importedFileName}
            importedFlightCount={importedFlightCount}
            onScheduleImport={onScheduleImport}
            onTabChange={onTabChange}
          />
          <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
