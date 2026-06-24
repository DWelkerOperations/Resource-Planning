import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { mockFlights } from "../../data/mockFlights";
import { planningRules } from "../../data/planningRules";
import { mockTrucks } from "../../data/mockResources";
import { createPlanningSchedule, enforceUrgentPairingLimit, filterScheduleResultByOperation, rejectCriticalPairings, rejectUnassignedPushes, timeToMinutes } from "../../engine/scheduler";
import { categoryForAircraft } from "../../import/aircraftMap";
import type { Driver, FlightAssignment, Helper, OperationView, PlanningRules, Push, ScheduleResult } from "../../types/dispatch";
import { resourceIds } from "../../utils/resources";
import { DispatcherTimeline } from "../timeline/DispatcherTimeline";
import { OperationToggle } from "../ui/OperationToggle";
import { Panel } from "../ui/Panel";
import { ExceptionTable, PushTable, ScheduleSummaryCards } from "./scheduleUi";

type PlanningToolPageProps = {
  flights?: FlightAssignment[];
  operationType: OperationView;
  rules?: PlanningRules;
  result: ScheduleResult | null;
  selectedDate: string;
  title?: string;
  description?: string;
  readyTitle?: string;
  readyDescription?: string;
  createButtonLabel?: string;
  assumptionTitle?: string;
  assumptionDescription?: string;
  resourcePlanPosition?: "above-timeline" | "below-timeline";
  resourcePlanTitle?: string;
  resourcePlanDescription?: string;
  disallowCriticalPairings?: boolean;
  enforcePairingQuality?: boolean;
  preventUrgentPairings?: boolean;
  showPairingQuality?: boolean;
  showIterationControls?: boolean;
  showRiskDefinitions?: boolean;
  timelineDriverLabelMode?: "actual" | "sequential";
  showTimelineDriverRadio?: boolean;
  exportButtonLabel?: string;
  maxAllowedStartTimes?: number;
  onDateChange: (date: string) => void;
  onOperationTypeChange: (operationType: OperationView) => void;
  onResultChange: (result: ScheduleResult | null) => void;
  onMaxAllowedStartTimesChange?: (value: number) => void;
  onExport?: (payload: PlanningExportPayload) => void;
};

type PlanningExportPayload = {
  result: ScheduleResult;
  startWaves: StartWave[];
  flights: FlightAssignment[];
  selectedDate: string;
  operationType: OperationView;
};

export function PlanningToolPage({
  flights = mockFlights,
  operationType,
  rules = planningRules,
  result,
  selectedDate,
  title = "Planning Tool",
  description = "Import a schedule, create the full-day plan once, then use the toggle to view mainline, express, or all work.",
  readyTitle = "Ready to Plan",
  readyDescription,
  createButtonLabel = "Create Pairings",
  assumptionTitle = "Planning Assumption",
  assumptionDescription,
  resourcePlanPosition = "below-timeline",
  resourcePlanTitle = "Resource Plan",
  resourcePlanDescription = "Driver starts by shift wave.",
  disallowCriticalPairings = false,
  enforcePairingQuality = false,
  preventUrgentPairings = false,
  showPairingQuality = false,
  showIterationControls = false,
  showRiskDefinitions = false,
  timelineDriverLabelMode = "actual",
  showTimelineDriverRadio = true,
  exportButtonLabel = "Export",
  maxAllowedStartTimes = defaultMaxShiftBidStartTimes,
  onDateChange,
  onOperationTypeChange,
  onResultChange,
  onMaxAllowedStartTimesChange,
  onExport,
}: PlanningToolPageProps) {
  const [iterationSettings, setIterationSettings] = useState({
    allowUrgentPairings: true,
    urgentPairingLimitPercent: 10,
    targetThreeFlightPairingPercent: standardThreeFlightPairingTargetPercent,
    maxFlightsPerPush: 3,
  });
  const runRules = showIterationControls ? { ...rules, maxFlightsPerPush: iterationSettings.maxFlightsPerPush } : rules;
  const urgentPairingLimit = showIterationControls && iterationSettings.allowUrgentPairings ? iterationSettings.urgentPairingLimitPercent : strictUrgentPairingLimitPercent;
  const shouldEnforceUrgentPairingLimit = enforcePairingQuality || preventUrgentPairings;
  const targetThreeFlightPairingPercent = showIterationControls ? iterationSettings.targetThreeFlightPairingPercent : standardThreeFlightPairingTargetPercent;
  const planningResources = useMemo(() => createPlanningResources(flights, runRules, defaultShiftStartIncrementMinutes), [flights, runRules]);
  const visibleResult = useMemo(() => result ? filterScheduleResultByOperation(result, operationType) : null, [operationType, result]);

  function handleCreatePairings(options?: { maxStartTimes?: number; shiftStartIncrementMinutes?: number }) {
    const shiftStartIncrementMinutes = options?.shiftStartIncrementMinutes ?? defaultShiftStartIncrementMinutes;
    const activePlanningResources = shiftStartIncrementMinutes === defaultShiftStartIncrementMinutes
      ? planningResources
      : createPlanningResources(flights, runRules, shiftStartIncrementMinutes);
    const maxStartTimes = options?.maxStartTimes ?? maxAllowedStartTimes;

    const createSchedule = (drivers: Driver[], helpers: Helper[], trucks: typeof planningResources.trucks, enforceQuality = true) => {
      const nextResult = createPlanningSchedule(flights, drivers, helpers, trucks, {
        rules: runRules,
        pairingStrategy: { targetThreeFlightPairingPercent, allowUrgentPairings: !preventUrgentPairings },
      });
      const criticalSafeResult = disallowCriticalPairings ? rejectCriticalPairings(nextResult) : nextResult;
      const urgentSafeResult = shouldEnforceUrgentPairingLimit && enforceQuality
        ? enforceUrgentPairingLimit(criticalSafeResult, urgentPairingLimit)
        : criticalSafeResult;
      return rejectUnassignedPushes(urgentSafeResult);
    };

    const firstPass = createSchedule(activePlanningResources.drivers, activePlanningResources.helpers, activePlanningResources.trucks, false);
    const selectedStartTimes = selectShiftBidStartTimes(firstPass.pushes, activePlanningResources.drivers, maxStartTimes);
    const targetResources = createTargetResources(selectedStartTimes, targetResourcesPerStart, createTargetTruckPool(), rules);
    onResultChange(createSchedule(targetResources.drivers, targetResources.helpers, targetResources.trucks));
  }

  const timelineDrivers = visibleResult ? driversUsedByPlan(planningResources.drivers, visibleResult.pushes) : planningResources.drivers.slice(0, 12);
  const startWaves = visibleResult ? createStartWaves(visibleResult.pushes, planningResources.drivers) : [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DateFilter value={selectedDate} onChange={onDateChange} />
            <OperationToggle value={operationType} onChange={onOperationTypeChange} />
            {onMaxAllowedStartTimesChange && (
              <StartTimeLimitSelect value={maxAllowedStartTimes} onChange={onMaxAllowedStartTimesChange} />
            )}
            <button onClick={() => handleCreatePairings()} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
              {createButtonLabel}
            </button>
            {onExport && visibleResult && (
              <button
                onClick={() => onExport({ result: visibleResult, startWaves, flights, selectedDate, operationType })}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50"
              >
                <Download size={16} aria-hidden="true" />
                {exportButtonLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {showIterationControls && (
        <IterationControls
          settings={iterationSettings}
          onChange={(nextSettings) => {
            setIterationSettings(nextSettings);
            onResultChange(null);
          }}
        />
      )}

      {!visibleResult ? (
        <Panel className="p-6">
          <h3 className="text-base font-semibold text-ink">{readyTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {readyDescription ?? `${flights.length} flights are loaded for ${selectedDate}. Click ${createButtonLabel} to build mainline and express pairings independently for the selected day.`}
          </p>
        </Panel>
      ) : (
        <>
          <ScheduleSummaryCards result={visibleResult} />
          {resourcePlanPosition === "above-timeline" && <PlanningResourcePanel result={visibleResult} startWaves={startWaves} title={resourcePlanTitle} description={resourcePlanDescription} />}
          {showPairingQuality && (
            <PairingQualityPanel
              result={visibleResult}
              flights={flights}
              operationType={operationType}
              urgentPairingLimitPercent={urgentPairingLimit}
              targetThreeFlightPairingPercent={targetThreeFlightPairingPercent}
            />
          )}
          {showRiskDefinitions && <RiskDefinitionsPanel />}
          <DispatcherTimeline
            flights={[]}
            drivers={timelineDrivers}
            pushes={visibleResult.pushes}
            driverLabelMode={timelineDriverLabelMode}
            showDriverRadio={showTimelineDriverRadio}
          />
          {resourcePlanPosition === "below-timeline" && <PlanningResourcePanel result={visibleResult} startWaves={startWaves} title={resourcePlanTitle} description={resourcePlanDescription} />}
          <Panel className="p-5">
            <h3 className="text-base font-semibold text-ink">{assumptionTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {assumptionDescription ?? `This run planned mainline and express independently so drivers and trucks do not mix across operations. The current view is ${operationType === "all" ? "the combined total" : `filtered to ${operationType}`}. Target completion is ${runRules.targetCompletionBeforeDepartureMinutes} minutes before departure, with a hard minimum of ${runRules.hardMinimumCompletionBeforeDepartureMinutes} minutes. For now, helper coverage mirrors driver coverage one-for-one.`}
            </p>
          </Panel>
          <PushTable result={visibleResult} />
          <ExceptionTable exceptions={visibleResult.exceptions} />
        </>
      )}
    </div>
  );
}

const strictUrgentPairingLimitPercent = 0;
const standardThreeFlightPairingTargetPercent = 80;
const minShiftBidStartTimes = 8;
const maxShiftBidStartTimes = 16;

function IterationControls({
  settings,
  onChange,
}: {
  settings: {
    allowUrgentPairings: boolean;
    urgentPairingLimitPercent: number;
    targetThreeFlightPairingPercent: number;
    maxFlightsPerPush: number;
  };
  onChange: (settings: {
    allowUrgentPairings: boolean;
    urgentPairingLimitPercent: number;
    targetThreeFlightPairingPercent: number;
    maxFlightsPerPush: number;
  }) => void;
}) {
  return (
    <Panel className="p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span>
            <span className="block text-sm font-semibold text-ink">Allow urgent pairings</span>
            <span className="block text-xs text-slate-500">Keep urgent work in the plan up to the selected tolerance.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.allowUrgentPairings}
            onChange={(event) => onChange({ ...settings, allowUrgentPairings: event.target.checked })}
            className="h-5 w-5 accent-ink"
          />
        </label>
        <SliderControl
          label="Urgent pairing tolerance"
          valueLabel={`${settings.allowUrgentPairings ? settings.urgentPairingLimitPercent : 0}%`}
          min={0}
          max={25}
          step={1}
          value={settings.allowUrgentPairings ? settings.urgentPairingLimitPercent : 0}
          disabled={!settings.allowUrgentPairings}
          onChange={(value) => onChange({ ...settings, urgentPairingLimitPercent: value })}
        />
        <SliderControl
          label="3-flight pairing target"
          valueLabel={`${settings.targetThreeFlightPairingPercent}%`}
          min={0}
          max={80}
          step={5}
          value={settings.targetThreeFlightPairingPercent}
          onChange={(value) => onChange({ ...settings, targetThreeFlightPairingPercent: value })}
        />
        <SliderControl
          label="Max flights per pairing"
          valueLabel={`${settings.maxFlightsPerPush}`}
          min={2}
          max={5}
          step={1}
          value={settings.maxFlightsPerPush}
          onChange={(value) => onChange({ ...settings, maxFlightsPerPush: value })}
        />
      </div>
    </Panel>
  );
}

function StartTimeLimitSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm">
      <span className="text-xs font-medium text-slate-500">Start waves</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="bg-transparent text-sm font-semibold text-ink outline-none"
        aria-label="Maximum start waves"
      >
        {Array.from({ length: maxShiftBidStartTimes - minShiftBidStartTimes + 1 }, (_, index) => minShiftBidStartTimes + index).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SliderControl({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm ${disabled ? "opacity-50" : ""}`}>
      <span className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
        {label}
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{valueLabel}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-ink"
      />
    </label>
  );
}

function PairingQualityPanel({
  result,
  flights,
  operationType,
  urgentPairingLimitPercent,
  targetThreeFlightPairingPercent,
}: {
  result: ScheduleResult;
  flights: FlightAssignment[];
  operationType: OperationView;
  urgentPairingLimitPercent: number;
  targetThreeFlightPairingPercent: number;
}) {
  const coverage = scheduleCoverageForView(result, flights, operationType);
  const urgentPercent = result.summary.totalPushes > 0
    ? Math.round((result.summary.urgentPushes / result.summary.totalPushes) * 100)
    : 0;
  const threeFlightPairingCount = result.pushes.filter((push) => push.flights.length === 3).length;
  const threeFlightPairingPercent = result.summary.totalPushes > 0
    ? Math.round((threeFlightPairingCount / result.summary.totalPushes) * 100)
    : 0;
  const threeFlightTargetMet = targetThreeFlightPairingPercent === 0 || threeFlightPairingPercent >= targetThreeFlightPairingPercent;
  const operationallyClean = urgentPercent <= urgentPairingLimitPercent && coverage.missingFlights.length === 0;
  const panelTone = operationallyClean
    ? threeFlightTargetMet
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-amber-200 bg-amber-50/60"
    : "border-red-200 bg-red-50/70";
  const urgentTone = urgentPercent <= urgentPairingLimitPercent
    ? "border-emerald-200 bg-white text-emerald-700"
    : "border-red-200 bg-white text-red-700";

  return (
    <Panel className={`p-4 ${panelTone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Pairing Quality</h3>
          <p className="mt-1 text-sm text-slate-600">Compare coverage, urgent timing, and 3-flight pairing yield for this iteration.</p>
        </div>
        <div className="flex items-center gap-2">
          <MiniMetric label="Flight Coverage" value={`${coverage.coveredFlights}/${coverage.expectedFlights}`} />
          <MiniMetric label="Missing Flights" value={coverage.missingFlights.length} />
          <MiniMetric label="Urgent Pairings" value={result.summary.urgentPushes} />
          <MiniMetric label="3-Flight Pairings" value={`${threeFlightPairingPercent}%`} />
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${urgentTone}`}>
            {urgentPercent}% urgent
          </div>
        </div>
      </div>
      {coverage.missingFlights.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700">
          Missing from plan: {coverage.missingFlights.slice(0, 16).map((flight) => flight.flightNumber).join(", ")}
          {coverage.missingFlights.length > 16 ? ` and ${coverage.missingFlights.length - 16} more` : ""}
        </div>
      )}
    </Panel>
  );
}

function scheduleCoverageForView(result: ScheduleResult, flights: FlightAssignment[], operationType: OperationView) {
  const expectedFlights = flights.filter((flight) => operationType === "all" || operationTypeForFlightAssignment(flight) === operationType);
  const coveredFlightIds = new Set<string>();

  for (const push of result.pushes) {
    for (const flight of push.flights) {
      if (flight.serviceType !== "intl-strip" || !flight.id.endsWith("-intl-strip")) coveredFlightIds.add(baseFlightId(flight.id));
    }
  }

  for (const exception of result.exceptions) {
    if (exception.flightId && (exception.serviceType !== "intl-strip" || !exception.flightId.endsWith("-intl-strip"))) coveredFlightIds.add(baseFlightId(exception.flightId));
  }

  return {
    expectedFlights: expectedFlights.length,
    coveredFlights: expectedFlights.filter((flight) => coveredFlightIds.has(flight.id)).length,
    missingFlights: expectedFlights.filter((flight) => !coveredFlightIds.has(flight.id)),
  };
}

function operationTypeForFlightAssignment(flight: FlightAssignment) {
  return categoryForAircraft(flight.aircraft) === "regional" ? "express" : "mainline";
}

function baseFlightId(flightId: string) {
  return flightId.replace(/-intl-strip$/, "");
}

function PlanningResourcePanel({ result, startWaves, title, description }: { result: ScheduleResult; startWaves: StartWave[]; title: string; description: string }) {
  return (
    <Panel className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[150px]">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <MiniMetric label="Drivers Needed" value={result.summary.driversRequired} />
          <MiniMetric label="Trucks Needed" value={result.summary.maxTrucksRequired} />
          <MiniMetric label="Helpers Needed" value={result.summary.helpersRequired} />
        </div>
        <div className="grid flex-1 grid-cols-5 gap-2 xl:grid-cols-10">
          {startWaves.map((wave) => (
            <div key={wave.startTime} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{wave.startTime}</div>
              <div className="text-base font-semibold leading-5 text-ink">{wave.driverStarts}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
      <div className="text-base font-semibold leading-5 text-ink">{value}</div>
    </div>
  );
}

function RiskDefinitionsPanel() {
  const keyItems = [
    { label: "Normal", window: "> 10 min", detail: "Before TCI D-10 off", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { label: "Watch", window: "6-10 min", detail: "Before TCI D-10 off", tone: "border-amber-200 bg-amber-50 text-amber-800" },
    { label: "Urgent", window: "0-5 min", detail: "Before TCI D-10 off", tone: "border-red-200 bg-red-50 text-red-700" },
    { label: "Critical", window: "Past TCI off", detail: "or unknown aircraft", tone: "border-red-300 bg-red-100 text-red-900" },
  ];

  return (
    <Panel className="p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="min-w-[150px] shrink-0">
          <h3 className="text-sm font-semibold text-ink">Timing Key</h3>
          <p className="mt-0.5 text-xs text-slate-500">International uses TCI D-30 off.</p>
        </div>
        <div className="grid min-w-[650px] flex-1 grid-cols-4 gap-2 text-xs text-slate-600">
          {keyItems.map((item) => <RiskKeyItem key={item.label} {...item} />)}
        </div>
      </div>
    </Panel>
  );
}

function RiskKeyItem({ label, window, detail, tone }: { label: string; window: string; detail: string; tone: string }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 shadow-sm ${tone}`}>
      <div className="text-[9px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold leading-4 text-ink">{window}</div>
      <div className="text-[10px] leading-4 text-slate-500">{detail}</div>
    </div>
  );
}

function driversUsedByPlan(drivers: Driver[], pushes: Push[]) {
  const usedDriverIds = new Set(pushes.flatMap((push) => resourceIds(push.driverId)));
  const firstPushByDriver = new Map<string, number>();

  for (const push of pushes) {
    const departure = timeToMinutes(push.kitchenDepartureTime);
    for (const driverId of resourceIds(push.driverId)) {
      const existing = firstPushByDriver.get(driverId);
      if (existing === undefined || departure < existing) firstPushByDriver.set(driverId, departure);
    }
  }

  return [...usedDriverIds]
    .map((driverId) => driverForResourceId(driverId, drivers))
    .sort((a, b) => {
      const shiftDelta = timeToMinutes(a.shiftStart) - timeToMinutes(b.shiftStart);
      if (shiftDelta !== 0) return shiftDelta;
      return (firstPushByDriver.get(a.id) ?? Number.POSITIVE_INFINITY) - (firstPushByDriver.get(b.id) ?? Number.POSITIVE_INFINITY);
    });
}

type StartWave = { startTime: string; driverStarts: number };

const defaultMaxShiftBidStartTimes = 12;
const targetResourcesPerStart = 260;
const defaultShiftStartIncrementMinutes = 30;

function createStartWaves(pushes: Push[], drivers: Driver[]): StartWave[] {
  const buckets = new Map<string, StartWave>();
  const countedDrivers = new Set<string>();

  for (const push of pushes) {
    for (const driverId of resourceIds(push.driverId)) {
      if (countedDrivers.has(driverId)) continue;
      const driver = driverForResourceId(driverId, drivers);
      const shiftStart = driver.displayShiftStart ?? driver.shiftStart;
      if (shiftStart && !buckets.has(shiftStart)) buckets.set(shiftStart, { startTime: shiftStart, driverStarts: 0 });
      const bucket = shiftStart ? buckets.get(shiftStart) : undefined;
      if (bucket) bucket.driverStarts += 1;
      countedDrivers.add(driverId);
    }
  }

  return [...buckets.values()]
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function driverForResourceId(driverId: string, drivers: Driver[]): Driver {
  const directMatch = drivers.find((driver) => driver.id === driverId);
  if (directMatch) return directMatch;

  const baseId = baseResourceId(driverId);
  const baseMatch = drivers.find((driver) => driver.id === baseId);
  if (baseMatch) {
    const label = resourceOperationLabel(driverId);
    return {
      ...baseMatch,
      id: driverId,
      name: label ? `${label} ${baseMatch.name}` : baseMatch.name,
    };
  }

  return {
    id: driverId,
    name: driverId,
    truck: "",
    radio: "",
    shiftStart: overnightDisplayStart,
    shiftEnd: overnightCoverageEndNextDay,
    displayShiftStart: overnightDisplayStart,
    displayShiftEnd: overnightCoverageEnd,
  };
}

function baseResourceId(resourceId: string) {
  return resourceId.replace(/^(mainline|express)-/, "");
}

function resourceOperationLabel(resourceId: string) {
  if (resourceId.startsWith("mainline-")) return "Mainline";
  if (resourceId.startsWith("express-")) return "Express";
  return "";
}

function createPlanningResources(flights: FlightAssignment[], rules: PlanningRules, shiftStartIncrementMinutes: number) {
  return createTargetResources(candidateShiftStartsForFlights(flights, rules, shiftStartIncrementMinutes), targetResourcesPerStart, createTargetTruckPool(), rules);
}

function createTargetResources(shiftStarts: string[], resourcesPerStart: number, trucks: ReturnType<typeof createTargetTruckPool> | typeof mockTrucks, rules: PlanningRules) {
  const shiftSpanMinutes = rules.standardShiftHours * 60 + rules.lunchMinutes;
  return {
    drivers: normalizedShiftStarts(shiftStarts).flatMap((shiftStart, shiftIndex) => Array.from({ length: resourcesPerStart }, (_, index): Driver => {
      const number = shiftIndex * resourcesPerStart + index + 1;
      const displayShiftStart = displayStartForShiftStart(shiftStart);
      const shiftEnd = actualEndForShiftStart(shiftStart, addMinutes(shiftStart, shiftSpanMinutes));
      const displayShiftEnd = displayEndForShiftStart(shiftStart, shiftEnd);
      const idSuffix = `${idPrefixForShiftStart(shiftStart)}-${index + 1}`;
      return {
        id: `d-${idSuffix}`,
        name: `Planning Driver ${String(number).padStart(3, "0")}`,
        truck: String(4100 + number).padStart(4, "0"),
        radio: String(100 + number).padStart(3, "0"),
        shiftStart,
        shiftEnd,
        displayShiftStart,
        displayShiftEnd,
      };
    })),
    helpers: normalizedShiftStarts(shiftStarts).flatMap((shiftStart, shiftIndex) => Array.from({ length: resourcesPerStart }, (_, index): Helper => {
      const number = shiftIndex * resourcesPerStart + index + 1;
      const displayShiftStart = displayStartForShiftStart(shiftStart);
      const shiftEnd = actualEndForShiftStart(shiftStart, addMinutes(shiftStart, shiftSpanMinutes));
      const displayShiftEnd = displayEndForShiftStart(shiftStart, shiftEnd);
      const idSuffix = `${idPrefixForShiftStart(shiftStart)}-${index + 1}`;
      return {
        id: `h-${idSuffix}`,
        name: `Planning Helper ${String(number).padStart(3, "0")}`,
        shiftStart,
        shiftEnd,
        displayShiftStart,
        displayShiftEnd,
      };
    })),
    trucks,
  };
}

function candidateShiftStartsForFlights(flights: FlightAssignment[], rules: PlanningRules, shiftStartIncrementMinutes: number) {
  const departureTimes = flights
    .map((flight) => timeToMinutes(flight.etd))
    .filter((minutes) => Number.isFinite(minutes));
  if (departureTimes.length === 0) return ["00:00"];

  const firstDeparture = Math.min(...departureTimes);
  const lastDeparture = Math.max(...departureTimes);
  const earliestCandidate = Math.max(0, snapToIncrement(firstDeparture - rules.maxKitchenDepartureBeforeDepartureMinutes - 15, shiftStartIncrementMinutes, "down"));
  const latestCandidate = snapToIncrement(lastDeparture, shiftStartIncrementMinutes, "up");
  const starts: string[] = [];

  for (let minutes = earliestCandidate; minutes <= latestCandidate; minutes += shiftStartIncrementMinutes) {
    starts.push(normalizedShiftStart(minutesToTime(minutes)));
  }

  return normalizedShiftStarts(starts);
}

function selectShiftBidStartTimes(pushes: Push[], drivers: Driver[], maxAllowedStartTimes: number) {
  const countedDrivers = new Set<string>();
  const waveCounts = new Map<string, number>();

  for (const push of pushes) {
    for (const driverId of resourceIds(push.driverId)) {
      if (countedDrivers.has(driverId)) continue;
      const start = driverForResourceId(driverId, drivers).shiftStart;
      if (start) waveCounts.set(start, (waveCounts.get(start) ?? 0) + 1);
      countedDrivers.add(driverId);
    }
  }

  const waves = [...waveCounts.entries()]
    .map(([startTime, driverStarts]) => ({ startTime, driverStarts, minutes: timeToMinutes(startTime) }))
    .sort((a, b) => a.minutes - b.minutes);

  const startTimeLimit = Math.max(minShiftBidStartTimes, Math.min(maxShiftBidStartTimes, maxAllowedStartTimes));

  while (waves.length > startTimeLimit) {
    const mergeIndex = lowestVolumeMergeableWaveIndex(waves);
    const neighborIndex = nearestWaveIndex(waves, mergeIndex);
    waves[neighborIndex].driverStarts += waves[mergeIndex].driverStarts;
    waves.splice(mergeIndex, 1);
  }

  return waves
    .sort((a, b) => a.minutes - b.minutes)
    .map((wave) => normalizedShiftStart(wave.startTime));
}

const earliestGeneratedDayStartMinutes = 180;
const overnightCoverageStart = "00:00";
const overnightCoverageEnd = "03:00";
const overnightCoverageEndNextDay = "27:00";
const overnightDisplayStart = "18:30";

function normalizedShiftStarts(shiftStarts: string[]) {
  return [...new Set(shiftStarts.map(normalizedShiftStart))]
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

function normalizedShiftStart(shiftStart: string) {
  return timeToMinutes(shiftStart) < earliestGeneratedDayStartMinutes ? overnightCoverageStart : shiftStart;
}

function displayStartForShiftStart(shiftStart: string) {
  return shiftStart;
}

function displayEndForShiftStart(_shiftStart: string, shiftEnd: string) {
  return shiftEnd;
}

function actualEndForShiftStart(_shiftStart: string, shiftEnd: string) {
  return shiftEnd;
}

function idPrefixForShiftStart(shiftStart: string) {
  if (shiftStart === overnightCoverageStart) return `overnight-${overnightDisplayStart.replace(":", "")}`;
  return shiftStart.replace(":", "");
}

function lowestVolumeMergeableWaveIndex(waves: StartWaveWithMinutes[]) {
  const mergeableWaves = waves
    .map((wave, index) => ({ ...wave, index }))
    .filter((wave) => wave.index > 0 && wave.index < waves.length - 1);
  const candidates = mergeableWaves.length > 0 ? mergeableWaves : waves.map((wave, index) => ({ ...wave, index }));

  return candidates.reduce((lowestIndex, wave) => {
    const lowest = waves[lowestIndex];
    if (wave.driverStarts !== lowest.driverStarts) return wave.driverStarts < lowest.driverStarts ? wave.index : lowestIndex;
    return nearestGapMinutes(waves, wave.index) < nearestGapMinutes(waves, lowestIndex) ? wave.index : lowestIndex;
  }, candidates[0].index);
}

function nearestWaveIndex(waves: StartWaveWithMinutes[], index: number) {
  if (index === 0) return 1;
  if (index === waves.length - 1) return waves.length - 2;
  const previousGap = waves[index].minutes - waves[index - 1].minutes;
  const nextGap = waves[index + 1].minutes - waves[index].minutes;
  if (previousGap !== nextGap) return previousGap < nextGap ? index - 1 : index + 1;
  return waves[index - 1].driverStarts >= waves[index + 1].driverStarts ? index - 1 : index + 1;
}

function nearestGapMinutes(waves: StartWaveWithMinutes[], index: number) {
  const previousGap = index > 0 ? waves[index].minutes - waves[index - 1].minutes : Number.POSITIVE_INFINITY;
  const nextGap = index < waves.length - 1 ? waves[index + 1].minutes - waves[index].minutes : Number.POSITIVE_INFINITY;
  return Math.min(previousGap, nextGap);
}

type StartWaveWithMinutes = StartWave & { minutes: number };

function createTargetTruckPool() {
  return [
    ...Array.from({ length: 360 }, (_, index) => ({
      id: `target-16-${index + 1}`,
      truckNumber: `T16-${String(index + 1).padStart(3, "0")}`,
      vehicleType: "16 Ft. Truck" as const,
    })),
    ...Array.from({ length: 120 }, (_, index) => ({
      id: `target-22-${index + 1}`,
      truckNumber: `T22-${String(index + 1).padStart(3, "0")}`,
      vehicleType: "22 Ft. Truck" as const,
    })),
    ...Array.from({ length: 160 }, (_, index) => ({
      id: `target-sov-${index + 1}`,
      truckNumber: `SOV-${String(index + 1).padStart(3, "0")}`,
      vehicleType: "10 Ft. SOV" as const,
    })),
  ];
}

function addMinutes(time: string, minutesToAdd: number) {
  const total = timeToMinutes(time) + minutesToAdd;
  return minutesToTime(total);
}

function minutesToTime(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function snapToIncrement(minutes: number, incrementMinutes: number, direction: "down" | "up") {
  const shiftStartIncrementMinutes = Math.max(1, incrementMinutes);
  const quotient = minutes / shiftStartIncrementMinutes;
  return (direction === "down" ? Math.floor(quotient) : Math.ceil(quotient)) * shiftStartIncrementMinutes;
}

function DateFilter({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
      Planning Date
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm font-semibold text-ink outline-none"
      />
    </label>
  );
}
