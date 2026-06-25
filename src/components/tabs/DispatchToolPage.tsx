import { useEffect, useMemo, useState } from "react";
import { mockDrivers } from "../../data/mockDrivers";
import { mockFlights } from "../../data/mockFlights";
import { mockHelpers, mockTrucks } from "../../data/mockResources";
import { ordCdlDriversForDate } from "../../data/ordCdlDrivers";
import { planningRules } from "../../data/planningRules";
import { createManualPlanState, moveFlightToPush, movePushByMinutes } from "../../engine/manualControl";
import { createDispatchSchedule, filterScheduleResultByOperation } from "../../engine/scheduler";
import type { Driver, FlightAssignment, Helper, OperationView, PlanningRules, Push, ResourceInputs, ScheduleResult } from "../../types/dispatch";
import { applyFlightTaskTypeChange, type FlightTaskTypeChange } from "../../utils/taskTypeUpdates";
import { resourceIds } from "../../utils/resources";
import { DispatcherTimeline } from "../timeline/DispatcherTimeline";
import { OperationToggle } from "../ui/OperationToggle";
import { Panel } from "../ui/Panel";
import { ExceptionTable, PushTable, ScheduleSummaryCards } from "./scheduleUi";

type DispatchToolPageProps = {
  flights?: FlightAssignment[];
  planningOperationType: OperationView;
  planningResult: ScheduleResult | null;
  rules?: PlanningRules;
  selectedDate: string;
  onDateChange: (date: string) => void;
};

export function DispatchToolPage({ flights = mockFlights, planningOperationType, planningResult, rules = planningRules, selectedDate, onDateChange }: DispatchToolPageProps) {
  const [operationType, setOperationType] = useState<OperationView>(planningOperationType);
  const [loadedPlan, setLoadedPlan] = useState<ScheduleResult | null>(null);
  const [dispatchResult, setDispatchResult] = useState<ScheduleResult | null>(null);
  const [draftDrivers, setDraftDrivers] = useState(4);
  const [draftHelpers, setDraftHelpers] = useState(1);
  const [draftTrucks, setDraftTrucks] = useState(3);
  const [resources, setResources] = useState<ResourceInputs>({
    availableDrivers: 4,
    availableHelpers: 1,
    availableTrucks: 3,
  });
  const availableDrivers = useMemo(() => {
    const cdlDrivers = ordCdlDriversForDate(selectedDate);
    return cdlDrivers.length > 0 ? cdlDrivers : mockDrivers;
  }, [selectedDate]);
  const availableHelpers = useMemo(() => {
    if (availableDrivers === mockDrivers) return mockHelpers;
    return availableDrivers.map((driver, index): Helper => ({
      id: `h-cdl-${index + 1}`,
      name: `Dispatch Helper ${String(index + 1).padStart(3, "0")}`,
      shiftStart: driver.shiftStart,
      shiftEnd: driver.shiftEnd,
    }));
  }, [availableDrivers]);

  useEffect(() => {
    setLoadedPlan(null);
    setDispatchResult(null);
    setOperationType(planningOperationType);
  }, [flights, selectedDate]);

  const fullDayResult = dispatchResult ?? loadedPlan;
  const result = useMemo(() => fullDayResult ? filterScheduleResultByOperation(fullDayResult, operationType) : null, [fullDayResult, operationType]);
  const timelineDrivers = result ? driversForPushes(result.pushes, availableDrivers) : availableDrivers.slice(0, 12);

  function handleLoadFromPlanning() {
    if (!planningResult) return;
    setLoadedPlan({ ...planningResult, mode: "dispatch" });
    setDispatchResult(null);
    setOperationType(planningOperationType);
    setDraftDrivers(planningResult.summary.driversRequired);
    setDraftHelpers(planningResult.summary.helpersRequired);
    setDraftTrucks(planningResult.summary.maxTrucksRequired);
    setResources({
      availableDrivers: planningResult.summary.driversRequired,
      availableHelpers: planningResult.summary.helpersRequired,
      availableTrucks: planningResult.summary.maxTrucksRequired,
    });
  }

  function handleRefreshPairings() {
    const nextResources = { availableDrivers: draftDrivers, availableHelpers: draftHelpers, availableTrucks: draftTrucks };
    setResources(nextResources);
    setDispatchResult(createDispatchSchedule(flights, availableDrivers, availableHelpers, mockTrucks, nextResources, { rules }));
    setLoadedPlan(null);
  }

  function handleTimelineTaskTypeChange(change: FlightTaskTypeChange) {
    setDispatchResult((currentResult) => currentResult ? applyFlightTaskTypeChange(currentResult, change) : currentResult);
    setLoadedPlan((currentPlan) => currentPlan ? applyFlightTaskTypeChange(currentPlan, change) : currentPlan);
  }

  function updateActiveDispatchResult(update: (currentResult: ScheduleResult) => ScheduleResult) {
    if (dispatchResult) {
      setDispatchResult(update(dispatchResult));
      return;
    }
    if (loadedPlan) {
      setLoadedPlan(update(loadedPlan));
    }
  }

  function handlePushTimeChange(change: { pushId: string; deltaMinutes: number }) {
    if (change.deltaMinutes === 0) return;
    updateActiveDispatchResult((currentResult) => movePushByMinutes(createManualPlanState(currentResult), change.pushId, change.deltaMinutes, rules).result);
  }

  function handleFlightMove(change: { flightId: string; targetPushId: string; targetSequence: number }) {
    updateActiveDispatchResult((currentResult) => moveFlightToPush(createManualPlanState(currentResult), change.flightId, change.targetPushId, change.targetSequence, rules).result);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Day-to-Day Dispatch Tool</h2>
            <p className="mt-1 text-sm text-slate-500">Live operations mode. Enter available resources to see the best achievable push plan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DateFilter value={selectedDate} onChange={onDateChange} />
            <OperationToggle value={operationType} onChange={setOperationType} />
            <button
              type="button"
              onClick={handleLoadFromPlanning}
              disabled={!planningResult}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Load From Planning
            </button>
          </div>
        </div>
      </div>
      {result ? (
        <>
          <ScheduleSummaryCards result={result} />
          <DispatcherTimeline
            flights={[]}
            drivers={timelineDrivers}
            pushes={result.pushes}
            onTaskTypeChange={handleTimelineTaskTypeChange}
            manualControlActive
            onPushTimeChange={handlePushTimeChange}
            onFlightMove={handleFlightMove}
          />
        </>
      ) : (
        <Panel className="p-6">
          <h3 className="text-base font-semibold text-ink">Ready for Dispatch</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Load the latest planning result or enter the resources available now, then refresh pairings to build the dispatch view.
          </p>
        </Panel>
      )}
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">Available Resources</h3>
            <p className="mt-1 text-sm text-slate-500">
              {loadedPlan
                ? "Planner shift counts are loaded. Adjust only if actual call-ins, truck outages, or helper coverage differ."
                : "Load the planning result to seed these counts from the recommended driver shifts for the day."}
            </p>
          </div>
          {loadedPlan && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Planning plan loaded</span>}
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-4">
          <ResourceInput label="Available Drivers" hint={`Planner asks for ${loadedPlan?.summary.driversRequired ?? planningResult?.summary.driversRequired ?? "no"} driver shifts`} value={draftDrivers} onChange={setDraftDrivers} />
          <ResourceInput label="Available Helpers" hint={`Planner asks for ${loadedPlan?.summary.helpersRequired ?? planningResult?.summary.helpersRequired ?? "no"} helpers`} value={draftHelpers} onChange={setDraftHelpers} />
          <ResourceInput label="Available Trucks" hint={`Planner asks for ${loadedPlan?.summary.maxTrucksRequired ?? planningResult?.summary.maxTrucksRequired ?? "no"} trucks`} value={draftTrucks} onChange={setDraftTrucks} />
          <button
            onClick={handleRefreshPairings}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            Refresh Pairings
          </button>
        </div>
      </Panel>
      {result?.resourceBottlenecks.length ? <Panel className="p-5"><h3 className="text-base font-semibold text-ink">Resource Bottleneck Explanation</h3><div className="mt-3 flex flex-wrap gap-2">{result.resourceBottlenecks.map((bottleneck) => <span key={bottleneck} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">{bottleneck}</span>)}</div></Panel> : null}
      {result && <PushTable result={result} />}
      {result && <ExceptionTable exceptions={result.exceptions} />}
    </div>
  );
}

function driversForPushes(pushes: Push[], availableDrivers: Driver[]): Driver[] {
  const usedDriverIds = [...new Set(pushes.flatMap((push) => resourceIds(push.driverId)))] as string[];
  if (usedDriverIds.length === 0) return availableDrivers;

  return usedDriverIds.map((driverId, index) => {
    const existingDriver = availableDrivers.find((driver) => driver.id === driverId);
    if (existingDriver) return existingDriver;
    const number = Number(driverId.replace(/\D/g, "")) || index + 1;
    return {
      id: driverId,
      name: `Planning Driver ${String(number).padStart(3, "0")}`,
      truck: String(4100 + index),
      radio: String(100 + index).padStart(3, "0"),
      shiftStart: "00:00",
      shiftEnd: "23:30",
    };
  });
}

function DateFilter({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
      Operation Date
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm font-semibold text-ink outline-none"
      />
    </label>
  );
}

function ResourceInput({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input min={0} max={200} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}
