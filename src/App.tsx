import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/tabs/DashboardPage";
import { DispatchToolPage } from "./components/tabs/DispatchToolPage";
import { ExceptionsPage } from "./components/tabs/ExceptionsPage";
import { FleetPage } from "./components/tabs/FleetPage";
import { PlanningToolPage } from "./components/tabs/PlanningToolPage";
import { StaffingPage } from "./components/tabs/StaffingPage";
import { ThumbRulesPage } from "./components/tabs/ThumbRulesPage";
import { TourSheetPage } from "./components/tabs/TourSheetPage";
import { ordJuneTripmasterDefaultAirport, ordJuneTripmasterDefaultDate, ordJuneTripmasterFileName, ordJuneTripmasterFlights } from "./data/ordJuneTripmasterFlights";
import { planningRules as defaultPlanningRules } from "./data/planningRules";
import { referenceSchedules, type ReferenceSchedule } from "./data/referenceSchedules";
import { exportResourceGuideWorkbook } from "./export/resourceGuideExport";
import { appBranding, isVisibleAppTab } from "./config/appBranding";
import type { AirportCode, AppTab, FlightAssignment, OperationView, PlanningRules, ScheduleResult } from "./types/dispatch";
import type { FlightTaskTypeChange } from "./utils/taskTypeUpdates";

type PlannerTabId = Extract<AppTab, "planning" | "resource-guide" | "ord-planner">;
type OrdPlannerStartTimeMode = "dynamic" | "fixed" | "fixed-resource";

type PlannerState = {
  airport: AirportCode;
  date: string;
  flights: FlightAssignment[];
  fileName: string;
  referenceScheduleId: string;
  customSchedule: PlannerScheduleSnapshot | null;
  operationType: OperationView;
  result: ScheduleResult | null;
  maxStartTimes?: number;
  startTimeMode?: OrdPlannerStartTimeMode;
};

type PlannerScheduleSnapshot = Pick<PlannerState, "airport" | "date" | "flights" | "fileName">;

const initialPlannerState: PlannerState = {
  airport: ordJuneTripmasterDefaultAirport,
  date: ordJuneTripmasterDefaultDate,
  flights: ordJuneTripmasterFlights,
  fileName: ordJuneTripmasterFileName,
  referenceScheduleId: "",
  customSchedule: null,
  operationType: "mainline",
  result: null,
};

const initialPlanners: Record<PlannerTabId, PlannerState> = {
  planning: initialPlannerState,
  "resource-guide": {
    ...initialPlannerState,
    maxStartTimes: 12,
  },
  "ord-planner": {
    ...initialPlannerState,
    maxStartTimes: 12,
    startTimeMode: "dynamic",
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("resource-guide");
  const [planners, setPlanners] = useState<Record<PlannerTabId, PlannerState>>(initialPlanners);
  const [activeRules, setActiveRules] = useState<PlanningRules>(defaultPlanningRules);
  const activePlannerTab = isPlannerTab(activeTab) ? activeTab : "planning";
  const planning = planners.planning;
  const resourceGuide = planners["resource-guide"];
  const ordPlanner = planners["ord-planner"];
  const planningVisibleFlights = useMemo(
    () => planning.flights.filter((flight) => flightMatchesSelectedSchedule(flight, planning.airport, planning.date)),
    [planning.airport, planning.date, planning.flights],
  );
  const resourceGuideVisibleFlights = useMemo(
    () => resourceGuide.flights.filter((flight) => flightMatchesSelectedSchedule(flight, resourceGuide.airport, resourceGuide.date)),
    [resourceGuide.airport, resourceGuide.date, resourceGuide.flights],
  );
  const ordPlannerVisibleFlights = useMemo(
    () => ordPlanner.flights.filter((flight) => flightMatchesSelectedSchedule(flight, ordPlanner.airport, ordPlanner.date)),
    [ordPlanner.airport, ordPlanner.date, ordPlanner.flights],
  );
  const visibleFlightsByTab: Record<PlannerTabId, FlightAssignment[]> = {
    planning: planningVisibleFlights,
    "resource-guide": resourceGuideVisibleFlights,
    "ord-planner": ordPlannerVisibleFlights,
  };
  const activeSchedule = {
    ...planners[activePlannerTab],
    visibleFlights: visibleFlightsByTab[activePlannerTab],
  };

  useEffect(() => {
    document.title = appBranding.productName;
  }, []);

  function updatePlanner(tabId: PlannerTabId, partial: Partial<PlannerState>) {
    setPlanners((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        ...partial,
      },
    }));
  }

  function handleScheduleImport(flights: FlightAssignment[], fileName: string, selectedDate?: string) {
    const firstImportedDate = selectedDate || flights.find((flight) => flight.departureDate)?.departureDate;
    const firstImportedAirport = flights.find((flight) => (!firstImportedDate || flight.departureDate === firstImportedDate) && flight.originAirport)?.originAirport
      ?? flights.find((flight) => flight.originAirport)?.originAirport;
    const currentPlanner = planners[activePlannerTab];
    const nextAirport = activePlannerTab === "ord-planner" ? "ORD" as AirportCode : firstImportedAirport ?? currentPlanner.airport;
    const nextDate = firstImportedDate ?? currentPlanner.date;
    const customSchedule = {
      airport: nextAirport,
      date: nextDate,
      flights,
      fileName,
    };

    updatePlanner(activePlannerTab, {
      ...customSchedule,
      customSchedule,
      referenceScheduleId: "",
      result: null,
    });
  }

  function handleScheduleClear() {
    updatePlanner(activePlannerTab, {
      flights: ordJuneTripmasterFlights,
      fileName: ordJuneTripmasterFileName,
      referenceScheduleId: "",
      customSchedule: null,
      airport: ordJuneTripmasterDefaultAirport,
      date: ordJuneTripmasterDefaultDate,
      result: null,
    });
  }

  function handleAirportChange(airport: AirportCode) {
    updatePlanner(activePlannerTab, { airport, result: null });
  }

  function handleReferenceScheduleLoad(schedule: ReferenceSchedule) {
    updatePlanner(activePlannerTab, {
      flights: schedule.flights,
      fileName: schedule.fileName,
      referenceScheduleId: schedule.id,
      airport: schedule.airport,
      date: schedule.date,
      result: null,
    });
  }

  function handleCustomScheduleLoad() {
    const customSchedule = planners[activePlannerTab].customSchedule;
    if (!customSchedule) return;
    updatePlanner(activePlannerTab, {
      ...customSchedule,
      referenceScheduleId: "",
      result: null,
    });
  }

  function handleDateChange(date: string) {
    updatePlanner("planning", { date, result: null });
  }

  function handleResourceGuideDateChange(date: string) {
    updatePlanner("resource-guide", { date, result: null });
  }

  function handleResourceGuideMaxStartTimesChange(value: number) {
    updatePlanner("resource-guide", { maxStartTimes: value, result: null });
  }

  function handleOrdPlannerDateChange(date: string) {
    updatePlanner("ord-planner", { date, result: null });
  }

  function handleOrdPlannerMaxStartTimesChange(value: number) {
    updatePlanner("ord-planner", { maxStartTimes: value, result: null });
  }

  function handleOrdPlannerStartTimeModeChange(mode: OrdPlannerStartTimeMode) {
    updatePlanner("ord-planner", { startTimeMode: mode, result: null });
  }

  function handleOperationTypeChange(tabId: PlannerTabId, operationType: OperationView) {
    updatePlanner(tabId, { operationType });
  }

  function handleTabChange(tab: AppTab) {
    if (isVisibleAppTab(tab)) setActiveTab(tab);
  }

  function handlePlanningFlightTaskTypeChange(change: FlightTaskTypeChange) {
    setPlanners((current) => ({
      ...current,
      planning: {
        ...current.planning,
        flights: current.planning.flights.map((flight) => (
          flight.id === change.flightId ? { ...flight, serviceType: change.serviceType, edited: true } : flight
        )),
      },
    }));
  }

  function handleRulesChange(nextRules: PlanningRules) {
    setActiveRules(nextRules);
    setPlanners((current) => ({
      planning: { ...current.planning, result: null },
      "resource-guide": { ...current["resource-guide"], result: null },
      "ord-planner": { ...current["ord-planner"], result: null },
    }));
  }

  return (
    <AppShell
      activeTab={activeTab}
      activeAirport={activeSchedule.airport}
      importedFileName={activeSchedule.fileName}
      importedFlightCount={activeSchedule.flights.length}
      hasCustomSchedule={Boolean(activeSchedule.customSchedule)}
      referenceSchedules={referenceSchedules}
      selectedReferenceScheduleId={activeSchedule.referenceScheduleId}
      visibleFlightCount={activeSchedule.visibleFlights.length}
      onAirportChange={handleAirportChange}
      onCustomScheduleLoad={handleCustomScheduleLoad}
      onReferenceScheduleLoad={handleReferenceScheduleLoad}
      onScheduleClear={handleScheduleClear}
      onScheduleImport={handleScheduleImport}
      onTabChange={handleTabChange}
    >
      {activeTab === "planning" && (
        <PlanningToolPage
          flights={planningVisibleFlights}
          operationType={planning.operationType}
          rules={activeRules}
          result={planning.result}
          selectedDate={planning.date}
          resourcePlanPosition="above-timeline"
          disallowCriticalPairings
          enforcePairingQuality
          showPairingQuality
          showIterationControls
          showRiskDefinitions
          timelineDriverLabelMode="sequential"
          showTimelineDriverRadio={false}
          onDateChange={handleDateChange}
          onFlightTaskTypeChange={handlePlanningFlightTaskTypeChange}
          onOperationTypeChange={(operationType) => handleOperationTypeChange("planning", operationType)}
          onResultChange={(result) => updatePlanner("planning", { result })}
        />
      )}
      {activeTab === "resource-guide" && (
        <PlanningToolPage
          flights={resourceGuideVisibleFlights}
          operationType={resourceGuide.operationType}
          rules={activeRules}
          result={resourceGuide.result}
          selectedDate={resourceGuide.date}
          title="Resource Guide"
          description="Import an Excel flight schedule, apply the thumb rules, and create optimized driver, helper, and truck resource guidance."
          readyTitle="Ready to Build Resource Guidance"
          readyDescription={`${resourceGuideVisibleFlights.length} flights are loaded for ${resourceGuide.date}. Import the schedule you want to plan, confirm the site and date, then create guidance to see the recommended resource levels and start waves.`}
          createButtonLabel="Create Guidance"
          assumptionTitle="Guidelines Applied"
          assumptionDescription={`This guidance uses the loaded flight schedule as the demand source, not an existing driver schedule. It plans mainline and express independently unless the active site's rules define a shared resource pool, then shows ${resourceGuide.operationType === "all" ? "the combined total" : `the ${resourceGuide.operationType} view`}. It protects required completion times, drive time, food safety windows, and a 30-minute lunch gap with no protection window, then chooses up to ${resourceGuide.maxStartTimes ?? 12} hour or half-hour start waves.`}
          resourcePlanPosition="above-timeline"
          resourcePlanTitle="Resource Guidance"
          resourcePlanDescription="Recommended driver, helper, and truck needs by start wave."
          disallowCriticalPairings
          preventUrgentPairings
          showPairingQuality
          showRiskDefinitions
          timelineDriverLabelMode="sequential"
          showTimelineDriverRadio={false}
          exportButtonLabel="Export Excel"
          maxAllowedStartTimes={resourceGuide.maxStartTimes}
          allowShiftOverflow={false}
          onDateChange={handleResourceGuideDateChange}
          onExport={(payload) => exportResourceGuideWorkbook({
            ...payload,
            sourceFileName: resourceGuide.fileName,
          })}
          onMaxAllowedStartTimesChange={handleResourceGuideMaxStartTimesChange}
          onOperationTypeChange={(operationType) => handleOperationTypeChange("resource-guide", operationType)}
          onResultChange={(result) => updatePlanner("resource-guide", { result })}
        />
      )}
      {activeTab === "ord-planner" && (
        <PlanningToolPage
          flights={ordPlannerVisibleFlights}
          operationType={ordPlanner.operationType}
          rules={activeRules}
          result={ordPlanner.result}
          selectedDate={ordPlanner.date}
          title="ORD Planner"
          description="Import the UA turns report for ORD to plan from outbound flight demand, aircraft type, strip requests, and planned inbound arrival time."
          readyTitle="Ready to Build ORD Guidance"
          readyDescription={`${ordPlannerVisibleFlights.length} ORD flights are loaded for ${ordPlanner.date}. Import the UA turns report, pick the date, then create guidance to use planned inbound arrivals as the earliest catering-ready time.`}
          createButtonLabel="Create ORD Guidance"
          assumptionTitle="UA Turns Logic"
          assumptionDescription={ordPlannerAssumptionDescription(ordPlanner.startTimeMode ?? "dynamic", ordPlanner.maxStartTimes ?? 12)}
          resourcePlanPosition="above-timeline"
          resourcePlanTitle="ORD Resource Guidance"
          resourcePlanDescription={ordPlannerResourcePlanDescription(ordPlanner.startTimeMode ?? "dynamic")}
          keepExceptionPushes
          showPairingQuality
          showRiskDefinitions
          timelineDriverLabelMode="sequential"
          showTimelineDriverRadio={false}
          exportButtonLabel="Export Excel"
          fixedStartResources={ordGoalStartResources}
          fixedStartTimes={ordFixedStartTimes}
          maxAllowedStartTimes={ordPlanner.maxStartTimes}
          startTimeMode={ordPlanner.startTimeMode}
          onDateChange={handleOrdPlannerDateChange}
          onExport={(payload) => exportResourceGuideWorkbook({
            ...payload,
            sourceFileName: ordPlanner.fileName,
          })}
          onMaxAllowedStartTimesChange={handleOrdPlannerMaxStartTimesChange}
          onOperationTypeChange={(operationType) => handleOperationTypeChange("ord-planner", operationType)}
          onResultChange={(result) => updatePlanner("ord-planner", { result })}
          onStartTimeModeChange={handleOrdPlannerStartTimeModeChange}
        />
      )}
      {activeTab === "dispatch" && (
        <DispatchToolPage
          flights={planningVisibleFlights}
          planningOperationType={planning.operationType}
          planningResult={planning.result}
          rules={activeRules}
          selectedDate={planning.date}
          onDateChange={handleDateChange}
        />
      )}
      {activeTab === "staffing" && <StaffingPage activeAirport={planning.airport} activeDate={planning.date} onDateChange={handleDateChange} />}
      {activeTab === "fleet" && <FleetPage activeAirport={planning.airport} />}
      {activeTab === "exceptions" && <ExceptionsPage />}
      {activeTab === "tour-sheet" && <TourSheetPage />}
      {activeTab === "dashboard" && <DashboardPage />}
      {activeTab === "thumb-rules" && <ThumbRulesPage rules={activeRules} onRulesChange={handleRulesChange} />}
    </AppShell>
  );
}

const ordFixedStartTimes = ["02:30", "04:00", "05:30", "06:30", "08:30", "11:00", "13:00", "14:30", "16:30", "18:30"];
const ordGoalStartResources = [
  { startTime: "02:30", resources: 8 },
  { startTime: "04:00", resources: 28 },
  { startTime: "05:30", resources: 2 },
  { startTime: "06:30", resources: 13 },
  { startTime: "08:30", resources: 22 },
  { startTime: "11:00", resources: 23 },
  { startTime: "13:00", resources: 16 },
  { startTime: "14:30", resources: 15 },
  { startTime: "16:30", resources: 12 },
  { startTime: "18:30", resources: 8 },
];

function ordPlannerAssumptionDescription(mode: "dynamic" | "fixed" | "fixed-resource", maxStartTimes: number) {
  const baseDescription = "This ORD plan reads outbound flight, destination, and departure time from the UA turns report, uses the aircraft shown on the turn, and treats the inbound arrival time as the earliest aircraft-ready constraint. Rows with a strip value are planned as protected strip work. It preserves a 30-minute lunch between shift hours 3 and 5";
  if (mode === "fixed-resource") {
    return `${baseDescription}, then uses the Goal row as fixed staffing by start wave: ${ordGoalStartResources.map((item) => `${item.startTime} ${item.resources}`).join(", ")}.`;
  }
  if (mode === "fixed") {
    return `${baseDescription}, then models the current-state ORD start pattern exactly: ${ordFixedStartTimes.join(", ")}.`;
  }
  return `${baseDescription}, then chooses up to ${maxStartTimes} hour or half-hour start waves for driver, helper, and truck guidance.`;
}

function ordPlannerResourcePlanDescription(mode: "dynamic" | "fixed" | "fixed-resource") {
  if (mode === "fixed-resource") return "Best ORD plan using the Goal row as fixed driver and helper staffing by start wave.";
  if (mode === "fixed") return "Recommended ORD needs using the fixed current-state start waves.";
  return "Recommended ORD driver, helper, and truck needs by start wave.";
}

function flightMatchesSelectedSchedule(flight: FlightAssignment, airport: AirportCode, date: string) {
  return flight.originAirport === airport && flight.departureDate === date;
}

function isPlannerTab(tab: AppTab): tab is PlannerTabId {
  return tab === "planning" || tab === "resource-guide" || tab === "ord-planner";
}
