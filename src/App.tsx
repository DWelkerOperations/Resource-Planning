import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/tabs/DashboardPage";
import { DispatchToolPage } from "./components/tabs/DispatchToolPage";
import { ExceptionsPage } from "./components/tabs/ExceptionsPage";
import { PlanningToolPage } from "./components/tabs/PlanningToolPage";
import { ThumbRulesPage } from "./components/tabs/ThumbRulesPage";
import { TourSheetPage } from "./components/tabs/TourSheetPage";
import { DispatcherTimeline } from "./components/timeline/DispatcherTimeline";
import { mockFlights } from "./data/mockFlights";
import type { AppTab, FlightAssignment } from "./types/dispatch";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("planning");
  const [scheduleFlights, setScheduleFlights] = useState<FlightAssignment[]>(mockFlights);
  const [importedFileName, setImportedFileName] = useState<string>();

  function handleScheduleImport(flights: FlightAssignment[], fileName: string) {
    setScheduleFlights(flights);
    setImportedFileName(fileName);
    setActiveTab("planning");
  }

  return (
    <AppShell
      activeTab={activeTab}
      importedFileName={importedFileName}
      importedFlightCount={scheduleFlights.length}
      onScheduleImport={handleScheduleImport}
      onTabChange={setActiveTab}
    >
      {activeTab === "planning" && <PlanningToolPage flights={scheduleFlights} />}
      {activeTab === "dispatch" && <DispatchToolPage flights={scheduleFlights} />}
      {activeTab === "timeline" && <DispatcherTimeline flights={scheduleFlights} />}
      {activeTab === "exceptions" && <ExceptionsPage />}
      {activeTab === "tour-sheet" && <TourSheetPage />}
      {activeTab === "dashboard" && <DashboardPage />}
      {activeTab === "thumb-rules" && <ThumbRulesPage />}
    </AppShell>
  );
}
