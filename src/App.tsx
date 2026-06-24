import { useMemo, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/tabs/DashboardPage";
import { DispatchToolPage } from "./components/tabs/DispatchToolPage";
import { ExceptionsPage } from "./components/tabs/ExceptionsPage";
import { FleetPage } from "./components/tabs/FleetPage";
import { PlanningToolPage } from "./components/tabs/PlanningToolPage";
import { StaffingPage } from "./components/tabs/StaffingPage";
import { ThumbRulesPage } from "./components/tabs/ThumbRulesPage";
import { TourSheetPage } from "./components/tabs/TourSheetPage";
import { ordMay14DefaultAirport, ordMay14DefaultDate, ordMay14FileName, ordMay14Flights } from "./data/ordMay14Flights";
import { pdxJune11DefaultAirport, pdxJune11DefaultDate, pdxJune11FileName, pdxJune11Flights } from "./data/pdxJune11Flights";
import { planningRules as defaultPlanningRules } from "./data/planningRules";
import { referenceSchedules, type ReferenceSchedule } from "./data/referenceSchedules";
import { exportResourceGuideWorkbook } from "./export/resourceGuideExport";
import type { AirportCode, AppTab, FlightAssignment, OperationView, PlanningRules, ScheduleResult } from "./types/dispatch";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("resource-guide");
  const [planningAirport, setPlanningAirport] = useState<AirportCode>(ordMay14DefaultAirport);
  const [planningDate, setPlanningDate] = useState(ordMay14DefaultDate);
  const [planningFlights, setPlanningFlights] = useState<FlightAssignment[]>(ordMay14Flights);
  const [planningFileName, setPlanningFileName] = useState<string>(ordMay14FileName);
  const [planningReferenceScheduleId, setPlanningReferenceScheduleId] = useState("");
  const [planningOperationType, setPlanningOperationType] = useState<OperationView>("mainline");
  const [planningResult, setPlanningResult] = useState<ScheduleResult | null>(null);
  const [activeRules, setActiveRules] = useState<PlanningRules>(defaultPlanningRules);
  const [resourceGuideAirport, setResourceGuideAirport] = useState<AirportCode>(pdxJune11DefaultAirport);
  const [resourceGuideDate, setResourceGuideDate] = useState(pdxJune11DefaultDate);
  const [resourceGuideFlights, setResourceGuideFlights] = useState<FlightAssignment[]>(pdxJune11Flights);
  const [resourceGuideFileName, setResourceGuideFileName] = useState<string>(pdxJune11FileName);
  const [resourceGuideReferenceScheduleId, setResourceGuideReferenceScheduleId] = useState("");
  const [resourceGuideOperationType, setResourceGuideOperationType] = useState<OperationView>("mainline");
  const [resourceGuideResult, setResourceGuideResult] = useState<ScheduleResult | null>(null);
  const [resourceGuideMaxStartTimes, setResourceGuideMaxStartTimes] = useState(12);
  const [ordPlannerAirport, setOrdPlannerAirport] = useState<AirportCode>(ordMay14DefaultAirport);
  const [ordPlannerDate, setOrdPlannerDate] = useState(ordMay14DefaultDate);
  const [ordPlannerFlights, setOrdPlannerFlights] = useState<FlightAssignment[]>(ordMay14Flights);
  const [ordPlannerFileName, setOrdPlannerFileName] = useState<string>(ordMay14FileName);
  const [ordPlannerReferenceScheduleId, setOrdPlannerReferenceScheduleId] = useState("");
  const [ordPlannerOperationType, setOrdPlannerOperationType] = useState<OperationView>("mainline");
  const [ordPlannerResult, setOrdPlannerResult] = useState<ScheduleResult | null>(null);
  const [ordPlannerMaxStartTimes, setOrdPlannerMaxStartTimes] = useState(12);
  const planningVisibleFlights = useMemo(
    () => planningFlights.filter((flight) => flightMatchesSelectedSchedule(flight, planningAirport, planningDate)),
    [planningAirport, planningDate, planningFlights],
  );
  const resourceGuideVisibleFlights = useMemo(
    () => resourceGuideFlights.filter((flight) => flightMatchesSelectedSchedule(flight, resourceGuideAirport, resourceGuideDate)),
    [resourceGuideAirport, resourceGuideDate, resourceGuideFlights],
  );
  const ordPlannerVisibleFlights = useMemo(
    () => ordPlannerFlights.filter((flight) => flightMatchesSelectedSchedule(flight, ordPlannerAirport, ordPlannerDate)),
    [ordPlannerAirport, ordPlannerDate, ordPlannerFlights],
  );
  const activeSchedule = activeTab === "resource-guide"
    ? { airport: resourceGuideAirport, date: resourceGuideDate, flights: resourceGuideFlights, visibleFlights: resourceGuideVisibleFlights, fileName: resourceGuideFileName, referenceScheduleId: resourceGuideReferenceScheduleId }
    : activeTab === "ord-planner"
      ? { airport: ordPlannerAirport, date: ordPlannerDate, flights: ordPlannerFlights, visibleFlights: ordPlannerVisibleFlights, fileName: ordPlannerFileName, referenceScheduleId: ordPlannerReferenceScheduleId }
    : { airport: planningAirport, date: planningDate, flights: planningFlights, visibleFlights: planningVisibleFlights, fileName: planningFileName, referenceScheduleId: planningReferenceScheduleId };

  function handleScheduleImport(flights: FlightAssignment[], fileName: string, selectedDate?: string) {
    const firstImportedDate = selectedDate || flights.find((flight) => flight.departureDate)?.departureDate;
    const firstImportedAirport = flights.find((flight) => (!firstImportedDate || flight.departureDate === firstImportedDate) && flight.originAirport)?.originAirport
      ?? flights.find((flight) => flight.originAirport)?.originAirport;
    if (activeTab === "resource-guide") {
      setResourceGuideFlights(flights);
      setResourceGuideFileName(fileName);
      setResourceGuideReferenceScheduleId("");
      setResourceGuideResult(null);
      if (firstImportedAirport) setResourceGuideAirport(firstImportedAirport);
      if (firstImportedDate) setResourceGuideDate(firstImportedDate);
      return;
    }
    if (activeTab === "ord-planner") {
      setOrdPlannerFlights(flights);
      setOrdPlannerFileName(fileName);
      setOrdPlannerReferenceScheduleId("");
      setOrdPlannerResult(null);
      setOrdPlannerAirport("ORD");
      if (firstImportedDate) setOrdPlannerDate(firstImportedDate);
      return;
    }

    setPlanningFlights(flights);
    setPlanningFileName(fileName);
    setPlanningReferenceScheduleId("");
    setPlanningResult(null);
    if (firstImportedAirport) setPlanningAirport(firstImportedAirport);
    if (firstImportedDate) setPlanningDate(firstImportedDate);
  }

  function handleScheduleClear() {
    if (activeTab === "resource-guide") {
      setResourceGuideFlights(pdxJune11Flights);
      setResourceGuideFileName(pdxJune11FileName);
      setResourceGuideReferenceScheduleId("");
      setResourceGuideAirport(pdxJune11DefaultAirport);
      setResourceGuideDate(pdxJune11DefaultDate);
      setResourceGuideResult(null);
      return;
    }
    if (activeTab === "ord-planner") {
      setOrdPlannerFlights(ordMay14Flights);
      setOrdPlannerFileName(ordMay14FileName);
      setOrdPlannerReferenceScheduleId("");
      setOrdPlannerAirport(ordMay14DefaultAirport);
      setOrdPlannerDate(ordMay14DefaultDate);
      setOrdPlannerResult(null);
      return;
    }

    setPlanningFlights(ordMay14Flights);
    setPlanningFileName(ordMay14FileName);
    setPlanningReferenceScheduleId("");
    setPlanningAirport(ordMay14DefaultAirport);
    setPlanningDate(ordMay14DefaultDate);
    setPlanningResult(null);
  }

  function handleAirportChange(airport: AirportCode) {
    if (activeTab === "resource-guide") {
      setResourceGuideAirport(airport);
      setResourceGuideResult(null);
      return;
    }
    if (activeTab === "ord-planner") {
      setOrdPlannerAirport(airport);
      setOrdPlannerResult(null);
      return;
    }

    setPlanningAirport(airport);
    setPlanningResult(null);
  }

  function handleReferenceScheduleLoad(schedule: ReferenceSchedule) {
    if (activeTab === "resource-guide") {
      setResourceGuideFlights(schedule.flights);
      setResourceGuideFileName(schedule.fileName);
      setResourceGuideReferenceScheduleId(schedule.id);
      setResourceGuideAirport(schedule.airport);
      setResourceGuideDate(schedule.date);
      setResourceGuideResult(null);
      return;
    }
    if (activeTab === "ord-planner") {
      setOrdPlannerFlights(schedule.flights);
      setOrdPlannerFileName(schedule.fileName);
      setOrdPlannerReferenceScheduleId(schedule.id);
      setOrdPlannerAirport(schedule.airport);
      setOrdPlannerDate(schedule.date);
      setOrdPlannerResult(null);
      return;
    }

    setPlanningFlights(schedule.flights);
    setPlanningFileName(schedule.fileName);
    setPlanningReferenceScheduleId(schedule.id);
    setPlanningAirport(schedule.airport);
    setPlanningDate(schedule.date);
    setPlanningResult(null);
  }

  function handleDateChange(date: string) {
    setPlanningDate(date);
    setPlanningResult(null);
  }

  function handleResourceGuideDateChange(date: string) {
    setResourceGuideDate(date);
    setResourceGuideResult(null);
  }

  function handleResourceGuideMaxStartTimesChange(value: number) {
    setResourceGuideMaxStartTimes(value);
    setResourceGuideResult(null);
  }

  function handleOrdPlannerDateChange(date: string) {
    setOrdPlannerDate(date);
    setOrdPlannerResult(null);
  }

  function handleOrdPlannerMaxStartTimesChange(value: number) {
    setOrdPlannerMaxStartTimes(value);
    setOrdPlannerResult(null);
  }

  function handleOperationTypeChange(operationType: OperationView) {
    setPlanningOperationType(operationType);
  }

  function handleRulesChange(nextRules: PlanningRules) {
    setActiveRules(nextRules);
    setPlanningResult(null);
    setResourceGuideResult(null);
    setOrdPlannerResult(null);
  }

  return (
    <AppShell
      activeTab={activeTab}
      activeAirport={activeSchedule.airport}
      importedFileName={activeSchedule.fileName}
      importedFlightCount={activeSchedule.flights.length}
      referenceSchedules={referenceSchedules}
      selectedReferenceScheduleId={activeSchedule.referenceScheduleId}
      visibleFlightCount={activeSchedule.visibleFlights.length}
      onAirportChange={handleAirportChange}
      onReferenceScheduleLoad={handleReferenceScheduleLoad}
      onScheduleClear={handleScheduleClear}
      onScheduleImport={handleScheduleImport}
      onTabChange={setActiveTab}
    >
      {activeTab === "planning" && (
        <PlanningToolPage
          flights={planningVisibleFlights}
          operationType={planningOperationType}
          rules={activeRules}
          result={planningResult}
          selectedDate={planningDate}
          resourcePlanPosition="above-timeline"
          disallowCriticalPairings
          enforcePairingQuality
          showPairingQuality
          showIterationControls
          showRiskDefinitions
          timelineDriverLabelMode="sequential"
          showTimelineDriverRadio={false}
          onDateChange={handleDateChange}
          onOperationTypeChange={handleOperationTypeChange}
          onResultChange={setPlanningResult}
        />
      )}
      {activeTab === "resource-guide" && (
        <PlanningToolPage
          flights={resourceGuideVisibleFlights}
          operationType={resourceGuideOperationType}
          rules={activeRules}
          result={resourceGuideResult}
          selectedDate={resourceGuideDate}
          title="Resource Guide"
          description="Import an Excel flight schedule, apply the thumb rules, and create optimized driver, helper, and truck resource guidance."
          readyTitle="Ready to Build Resource Guidance"
          readyDescription={`${resourceGuideVisibleFlights.length} flights are loaded for ${resourceGuideDate}. Import the schedule you want to plan, confirm the site and date, then create guidance to see the recommended resource levels and start waves.`}
          createButtonLabel="Create Guidance"
          assumptionTitle="Guidelines Applied"
          assumptionDescription={`This guidance uses the loaded flight schedule as the demand source, not an existing driver schedule. It plans mainline and express independently unless the active site's rules define a shared resource pool, then shows ${resourceGuideOperationType === "all" ? "the combined total" : `the ${resourceGuideOperationType} view`}. It protects required completion times, drive time, food safety windows, and lunch placement, then chooses up to ${resourceGuideMaxStartTimes} hour or half-hour start waves for the most efficient driver shift utilization it can find.`}
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
          maxAllowedStartTimes={resourceGuideMaxStartTimes}
          onDateChange={handleResourceGuideDateChange}
          onExport={(payload) => exportResourceGuideWorkbook({
            ...payload,
            sourceFileName: resourceGuideFileName,
          })}
          onMaxAllowedStartTimesChange={handleResourceGuideMaxStartTimesChange}
          onOperationTypeChange={setResourceGuideOperationType}
          onResultChange={setResourceGuideResult}
        />
      )}
      {activeTab === "ord-planner" && (
        <PlanningToolPage
          flights={ordPlannerVisibleFlights}
          operationType={ordPlannerOperationType}
          rules={activeRules}
          result={ordPlannerResult}
          selectedDate={ordPlannerDate}
          title="ORD Planner"
          description="Import the UA turns report for ORD to plan from outbound flight demand, aircraft type, strip requests, and planned inbound arrival time."
          readyTitle="Ready to Build ORD Guidance"
          readyDescription={`${ordPlannerVisibleFlights.length} ORD flights are loaded for ${ordPlannerDate}. Import the UA turns report, pick the date, then create guidance to use planned inbound arrivals as the earliest catering-ready time.`}
          createButtonLabel="Create ORD Guidance"
          assumptionTitle="UA Turns Logic"
          assumptionDescription={`This ORD plan reads outbound flight, destination, and departure time from the UA turns report, uses the aircraft shown on the turn, and treats the inbound arrival time as the earliest aircraft-ready constraint. Rows with a strip value are planned as protected strip work. It then chooses up to ${ordPlannerMaxStartTimes} hour or half-hour start waves for driver, helper, and truck guidance.`}
          resourcePlanPosition="above-timeline"
          resourcePlanTitle="ORD Resource Guidance"
          resourcePlanDescription="Recommended ORD driver, helper, and truck needs by start wave."
          disallowCriticalPairings
          preventUrgentPairings
          showPairingQuality
          showRiskDefinitions
          timelineDriverLabelMode="sequential"
          showTimelineDriverRadio={false}
          exportButtonLabel="Export Excel"
          maxAllowedStartTimes={ordPlannerMaxStartTimes}
          onDateChange={handleOrdPlannerDateChange}
          onExport={(payload) => exportResourceGuideWorkbook({
            ...payload,
            sourceFileName: ordPlannerFileName,
          })}
          onMaxAllowedStartTimesChange={handleOrdPlannerMaxStartTimesChange}
          onOperationTypeChange={setOrdPlannerOperationType}
          onResultChange={setOrdPlannerResult}
        />
      )}
      {activeTab === "dispatch" && (
        <DispatchToolPage
          flights={planningVisibleFlights}
          planningOperationType={planningOperationType}
          planningResult={planningResult}
          rules={activeRules}
          selectedDate={planningDate}
          onDateChange={handleDateChange}
        />
      )}
      {activeTab === "staffing" && <StaffingPage activeAirport={planningAirport} activeDate={planningDate} onDateChange={handleDateChange} />}
      {activeTab === "fleet" && <FleetPage activeAirport={planningAirport} />}
      {activeTab === "exceptions" && <ExceptionsPage />}
      {activeTab === "tour-sheet" && <TourSheetPage />}
      {activeTab === "dashboard" && <DashboardPage />}
      {activeTab === "thumb-rules" && <ThumbRulesPage rules={activeRules} onRulesChange={handleRulesChange} />}
    </AppShell>
  );
}

function flightMatchesSelectedSchedule(flight: FlightAssignment, airport: AirportCode, date: string) {
  return flight.originAirport === airport && flight.departureDate === date;
}
