import { useEffect, useMemo, useState } from "react";
import { Download, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";
import { mockFlights } from "../../data/mockFlights";
import { planningRules } from "../../data/planningRules";
import { mockTrucks } from "../../data/mockResources";
import { createManualPlanState, moveFlightToPush, movePushByMinutes, resetManualPlan, undoManualMove } from "../../engine/manualControl";
import { createPlanningSchedule, filterScheduleResultByOperation, timeToMinutes } from "../../engine/scheduler";
import { categoryForAircraft } from "../../import/aircraftMap";
import type { Driver, FlightAssignment, Helper, ManualPlanState, OperationView, PlanningRules, Push, ScheduleResult } from "../../types/dispatch";
import { applyFlightTaskTypeChange, type FlightTaskTypeChange } from "../../utils/taskTypeUpdates";
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
  keepExceptionPushes?: boolean;
  showPairingQuality?: boolean;
  showIterationControls?: boolean;
  showRiskDefinitions?: boolean;
  timelineDriverLabelMode?: "actual" | "sequential";
  showTimelineDriverRadio?: boolean;
  exportButtonLabel?: string;
  maxAllowedStartTimes?: number;
  startTimeMode?: StartTimeMode;
  fixedStartTimes?: string[];
  fixedStartResources?: FixedStartResource[];
  allowShiftOverflow?: boolean;
  onDateChange: (date: string) => void;
  onFlightTaskTypeChange?: (change: FlightTaskTypeChange) => void;
  onOperationTypeChange: (operationType: OperationView) => void;
  onResultChange: (result: ScheduleResult | null) => void;
  onMaxAllowedStartTimesChange?: (value: number) => void;
  onStartTimeModeChange?: (mode: StartTimeMode) => void;
  onExport?: (payload: PlanningExportPayload) => void;
};

type StartTimeMode = "dynamic" | "fixed" | "fixed-resource";
export type FixedStartResource = { startTime: string; resources: number };

type PlanningExportPayload = {
  result: ScheduleResult;
  startWaves: StartWave[];
  flights: FlightAssignment[];
  drivers: Driver[];
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
  preventUrgentPairings = false,
  showPairingQuality = false,
  showIterationControls = false,
  showRiskDefinitions = false,
  timelineDriverLabelMode = "actual",
  showTimelineDriverRadio = true,
  exportButtonLabel = "Export",
  maxAllowedStartTimes = defaultMaxShiftBidStartTimes,
  startTimeMode = "dynamic",
  fixedStartTimes = [],
  fixedStartResources = [],
  allowShiftOverflow = true,
  onDateChange,
  onFlightTaskTypeChange,
  onOperationTypeChange,
  onResultChange,
  onMaxAllowedStartTimesChange,
  onStartTimeModeChange,
  onExport,
}: PlanningToolPageProps) {
  const [iterationSettings, setIterationSettings] = useState({
    allowUrgentPairings: true,
    urgentPairingLimitPercent: 10,
    targetThreeFlightPairingPercent: standardThreeFlightPairingTargetPercent,
    maxFlightsPerPush: 3,
  });
  const [manualControlEnabled, setManualControlEnabled] = useState(false);
  const [manualPlan, setManualPlan] = useState<ManualPlanState | null>(null);
  const [allowReducedManualGaps, setAllowReducedManualGaps] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [isBuildingPlan, setIsBuildingPlan] = useState(false);
  const runRules = useMemo(
    () => showIterationControls ? { ...rules, maxFlightsPerPush: iterationSettings.maxFlightsPerPush } : rules,
    [iterationSettings.maxFlightsPerPush, rules, showIterationControls],
  );
  const urgentPairingLimit = showIterationControls && iterationSettings.allowUrgentPairings ? iterationSettings.urgentPairingLimitPercent : strictUrgentPairingLimitPercent;
  const targetThreeFlightPairingPercent = showIterationControls ? iterationSettings.targetThreeFlightPairingPercent : standardThreeFlightPairingTargetPercent;
  const isFixedStartTimeMode = startTimeMode === "fixed";
  const isFixedResourceMode = startTimeMode === "fixed-resource";
  const lunchWindowHours = lunchWindowHoursForFlights(flights, runRules);
  const planningResources = useMemo(
    () => isFixedResourceMode && fixedStartResources.length > 0
      ? createFixedResourcePlanningResources(fixedStartResources, runRules)
      : isFixedStartTimeMode && fixedStartTimes.length > 0
      ? createFixedStartPlanningResources(fixedStartTimes, runRules)
      : createPlanningResources(flights, runRules, defaultShiftStartIncrementMinutes),
    [fixedStartResources, fixedStartTimes, flights, isFixedResourceMode, isFixedStartTimeMode, runRules],
  );
  const activeResult = manualControlEnabled && manualPlan ? manualPlan.result : result;
  const visibleResult = useMemo(() => activeResult ? filterScheduleResultByOperation(activeResult, operationType) : null, [operationType, activeResult]);

  useEffect(() => {
    setManualControlEnabled(false);
    setManualPlan(null);
    setAllowReducedManualGaps(false);
  }, [result]);

  async function handleCreatePairings(options?: { maxStartTimes?: number; shiftStartIncrementMinutes?: number }) {
    setPlanningError(null);
    setIsBuildingPlan(true);

    try {
      await waitForPaint();
      const shiftStartIncrementMinutes = options?.shiftStartIncrementMinutes ?? defaultShiftStartIncrementMinutes;
      const activePlanningResources = isFixedResourceMode && fixedStartResources.length > 0
        ? createFixedResourcePlanningResources(fixedStartResources, runRules)
        : isFixedStartTimeMode && fixedStartTimes.length > 0
        ? createFixedStartPlanningResources(fixedStartTimes, runRules)
        : shiftStartIncrementMinutes === defaultShiftStartIncrementMinutes
        ? planningResources
        : createPlanningResources(flights, runRules, shiftStartIncrementMinutes);
      const maxStartTimes = options?.maxStartTimes ?? maxAllowedStartTimes;

      const createSchedule = (drivers: Driver[], helpers: Helper[], trucks: typeof planningResources.trucks) => createPlanningSchedule(flights, drivers, helpers, trucks, {
        rules: runRules,
        pairingStrategy: { targetThreeFlightPairingPercent, allowUrgentPairings: !preventUrgentPairings },
        allowShiftOverflow,
      });

      const firstPass = createSchedule(activePlanningResources.drivers, activePlanningResources.helpers, activePlanningResources.trucks);
      const selectedStartTimes = !allowShiftOverflow
        ? candidateShiftStartsForFlights(flights, runRules, shiftStartIncrementMinutes)
        : (isFixedStartTimeMode || isFixedResourceMode) && fixedStartTimes.length > 0
        ? fixedStartTimes
        : selectShiftBidStartTimes(firstPass.pushes, activePlanningResources.drivers, maxStartTimes);
      const targetResources = isFixedResourceMode && fixedStartResources.length > 0
        ? createFixedResourcePlanningResources(fixedStartResources, rules)
        : createTargetResources(selectedStartTimes, targetResourcesPerStart, createTargetTruckPool(), rules, { preserveExactStarts: isFixedStartTimeMode });
      onResultChange(createSchedule(targetResources.drivers, targetResources.helpers, targetResources.trucks));
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : "Could not create guidance for this schedule.");
      onResultChange(null);
    } finally {
      setIsBuildingPlan(false);
    }
  }

  function handleManualControlToggle() {
    if (!result) return;
    if (manualControlEnabled) {
      setManualControlEnabled(false);
      return;
    }
    setManualPlan(createManualPlanState(result));
    setManualControlEnabled(true);
  }

  function handlePushTimeChange(change: { pushId: string; deltaMinutes: number }) {
    if (!manualPlan || change.deltaMinutes === 0) return;
    setManualPlan(movePushByMinutes(manualPlan, change.pushId, change.deltaMinutes, runRules));
  }

  function handleFlightMove(change: { flightId: string; targetPushId: string; targetSequence: number }) {
    if (!manualPlan) return;
    setManualPlan(moveFlightToPush(manualPlan, change.flightId, change.targetPushId, change.targetSequence, runRules, {
      gapMinutes: allowReducedManualGaps ? 5 : undefined,
    }));
  }

  function handleManualUndo() {
    if (!manualPlan) return;
    setManualPlan(undoManualMove(manualPlan));
  }

  function handleManualReset() {
    if (!manualPlan) return;
    setManualPlan(resetManualPlan(manualPlan));
  }

  function handleTimelineTaskTypeChange(change: FlightTaskTypeChange) {
    if (!result) return;
    onResultChange(applyFlightTaskTypeChange(result, change));
    onFlightTaskTypeChange?.(change);
  }

  const rawTimelineDrivers = visibleResult ? driversUsedByPlan(planningResources.drivers, visibleResult.pushes) : planningResources.drivers.slice(0, 12);
  const timelineDrivers = visibleResult ? limitDriverDisplayStartWaves(rawTimelineDrivers, visibleResult.pushes, maxAllowedStartTimes, runRules) : rawTimelineDrivers;
  const startWaves = visibleResult
    ? createStartWaves(visibleResult.pushes, timelineDrivers)
    : [];

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
            {(onMaxAllowedStartTimesChange || onStartTimeModeChange) && (
              <StartTimeControls
                fixedStartTimes={fixedStartTimes}
                fixedStartResources={fixedStartResources}
                maxAllowedStartTimes={maxAllowedStartTimes}
                mode={startTimeMode}
                onMaxAllowedStartTimesChange={onMaxAllowedStartTimesChange}
                onModeChange={onStartTimeModeChange}
              />
            )}
            <button
              type="button"
              onClick={() => void handleCreatePairings()}
              disabled={isBuildingPlan || flights.length === 0}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
            >
              {isBuildingPlan ? "Building..." : createButtonLabel}
            </button>
            {onExport && visibleResult && (
              <button
                onClick={() => onExport({ result: visibleResult, startWaves, flights, drivers: timelineDrivers, selectedDate, operationType })}
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

      {planningError && (
        <Panel className="border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Could not create guidance</p>
          <p className="mt-1 text-sm leading-6 text-red-700">{planningError}</p>
        </Panel>
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
          <ScheduleSummaryCards result={visibleResult} drivers={timelineDrivers} />
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
          <ManualControlPanel
            enabled={manualControlEnabled}
            historyCount={manualPlan?.history.length ?? 0}
            manualPushCount={manualPlan ? Object.keys(manualPlan.pushOverrides).length : 0}
            manualFlightCount={manualPlan ? Object.keys(manualPlan.flightOverrides).length : 0}
            allowReducedManualGaps={allowReducedManualGaps}
            onToggle={handleManualControlToggle}
            onUndo={handleManualUndo}
            onReset={handleManualReset}
            onReducedGapChange={setAllowReducedManualGaps}
          />
          <DispatcherTimeline
            flights={[]}
            drivers={timelineDrivers}
            pushes={visibleResult.pushes}
            driverLabelMode={timelineDriverLabelMode}
            lunchWindowHours={lunchWindowHours}
            showDriverRadio={showTimelineDriverRadio}
            onTaskTypeChange={onFlightTaskTypeChange ? handleTimelineTaskTypeChange : undefined}
            manualControlActive={manualControlEnabled}
            onPushTimeChange={handlePushTimeChange}
            onFlightMove={handleFlightMove}
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

function ManualControlPanel({
  enabled,
  historyCount,
  manualPushCount,
  manualFlightCount,
  allowReducedManualGaps,
  onToggle,
  onUndo,
  onReset,
  onReducedGapChange,
}: {
  enabled: boolean;
  historyCount: number;
  manualPushCount: number;
  manualFlightCount: number;
  allowReducedManualGaps: boolean;
  onToggle: () => void;
  onUndo: () => void;
  onReset: () => void;
  onReducedGapChange: (enabled: boolean) => void;
}) {
  return (
    <Panel className={`p-4 ${enabled ? "border-blue-200 bg-blue-50/60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Manual Control
            {enabled && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white">Live</span>}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Drag push blocks horizontally to snap timing in 5-minute increments, or drag an individual flight chip onto another push to recalculate both pushes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enabled && (
            <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm">
              <input
                type="checkbox"
                checked={allowReducedManualGaps}
                onChange={(event) => onReducedGapChange(event.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Allow 5m gaps
            </label>
          )}
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${enabled ? "border border-slate-200 bg-white text-ink hover:bg-slate-50" : "bg-ink text-white hover:bg-slate-800"}`}
          >
            {enabled ? "Exit Manual Control" : "Enter Manual Control"}
          </button>
          {enabled && (
            <>
              <button
                type="button"
                onClick={onUndo}
                disabled={historyCount === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                <Undo2 size={15} aria-hidden="true" />
                Undo
              </button>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50"
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
            </>
          )}
        </div>
      </div>
      {enabled && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">{manualPushCount} adjusted pushes</span>
          <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">{manualFlightCount} adjusted flights</span>
          <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">{historyCount} undo step{historyCount === 1 ? "" : "s"}</span>
        </div>
      )}
    </Panel>
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

function StartTimeControls({
  fixedStartTimes,
  fixedStartResources,
  maxAllowedStartTimes,
  mode,
  onMaxAllowedStartTimesChange,
  onModeChange,
}: {
  fixedStartTimes: string[];
  fixedStartResources: FixedStartResource[];
  maxAllowedStartTimes: number;
  mode: StartTimeMode;
  onMaxAllowedStartTimesChange?: (value: number) => void;
  onModeChange?: (mode: StartTimeMode) => void;
}) {
  if (!onModeChange) {
    return onMaxAllowedStartTimesChange
      ? <StartTimeLimitSelect value={maxAllowedStartTimes} onChange={onMaxAllowedStartTimesChange} />
      : null;
  }

  const isFixed = mode === "fixed";
  const isFixedResource = mode === "fixed-resource";
  const disablesStartWaveLimit = isFixed || isFixedResource;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => onModeChange("dynamic")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${!isFixed ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}
          >
            Dynamic starts
          </button>
          <button
            type="button"
            onClick={() => onModeChange("fixed")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${isFixed ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}
          >
            Fixed starts
          </button>
          {fixedStartResources.length > 0 && (
            <button
              type="button"
              onClick={() => onModeChange("fixed-resource")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${isFixedResource ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}
            >
              Goal staffing
            </button>
          )}
        </div>
        {onMaxAllowedStartTimesChange && (
          <StartTimeLimitSelect
            value={maxAllowedStartTimes}
            disabled={disablesStartWaveLimit}
            helperText={isFixedResource ? "Using Goal row" : isFixed ? "Not used in fixed mode" : undefined}
            onChange={onMaxAllowedStartTimesChange}
          />
        )}
      </div>
      {isFixed && fixedStartTimes.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {fixedStartTimes.map((startTime) => (
            <span key={startTime} className="rounded-md bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold text-slate-700">
              {startTime}
            </span>
          ))}
        </div>
      )}
      {isFixedResource && fixedStartResources.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {fixedStartResources.map((item) => (
            <span key={item.startTime} className="rounded-md bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold text-slate-700">
              {item.startTime} · {item.resources}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StartTimeLimitSelect({
  value,
  disabled = false,
  helperText,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  helperText?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-ink ${disabled ? "bg-slate-50 opacity-60" : "bg-white"}`}>
      <span className="text-xs font-medium text-slate-500">{helperText ?? "Start waves"}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="bg-transparent text-sm font-semibold text-ink outline-none disabled:text-slate-500"
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
  const allFlightsPaired = coverage.scheduledFlights === coverage.expectedFlights && coverage.missingFlights.length === 0;
  const operationallyClean = urgentPercent <= urgentPairingLimitPercent && coverage.exceptionFlights.length === 0 && allFlightsPaired;
  const panelTone = operationallyClean
    ? threeFlightTargetMet
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-amber-200 bg-amber-50/60"
    : "border-red-200 bg-red-50/70";
  const urgentTone = urgentPercent <= urgentPairingLimitPercent
    ? "border-emerald-200 bg-white text-emerald-700"
    : "border-red-200 bg-white text-red-700";
  const pairedLabel = allFlightsPaired ? "All paired" : `${coverage.scheduledFlights}/${coverage.expectedFlights} paired`;

  return (
    <Panel className={`p-4 ${panelTone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Pairing Quality</h3>
          <p className="mt-1 text-sm text-slate-600">Compare coverage, urgent timing, and 3-flight pairing yield for this iteration.</p>
        </div>
        <div className="flex items-center gap-2">
          <MiniMetric label="Paired Flights" value={`${coverage.scheduledFlights}/${coverage.expectedFlights}`} />
          <MiniMetric label="Exception Flights" value={coverage.exceptionFlights.length} />
          <MiniMetric label="Missing Flights" value={coverage.missingFlights.length} />
          <MiniMetric label="Urgent Pairings" value={result.summary.urgentPushes} />
          <MiniMetric label="3-Flight Pairings" value={`${threeFlightPairingPercent}%`} />
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${coverage.exceptionFlights.length === 0 && coverage.missingFlights.length === 0 ? "border-emerald-200 bg-white text-emerald-700" : "border-red-200 bg-white text-red-700"}`}>
            {pairedLabel}
          </div>
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${urgentTone}`}>
            {urgentPercent}% urgent
          </div>
        </div>
      </div>
      {coverage.exceptionFlights.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700">
          Paired with exceptions: {coverage.exceptionFlights.length} flight{coverage.exceptionFlights.length === 1 ? "" : "s"} need timing or resource review, but they remain in the plan.
        </div>
      )}
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
  const plannedFlightIds = new Set<string>();

  for (const push of result.pushes) {
    for (const flight of push.flights) {
      if (flight.serviceType !== "intl-strip" || !flight.id.endsWith("-intl-strip")) plannedFlightIds.add(baseFlightId(flight.id));
    }
  }

  const exceptionFlightIds = new Set<string>();
  for (const exception of result.exceptions) {
    if (exception.flightId && (exception.serviceType !== "intl-strip" || !exception.flightId.endsWith("-intl-strip"))) exceptionFlightIds.add(baseFlightId(exception.flightId));
  }

  return {
    expectedFlights: expectedFlights.length,
    scheduledFlights: expectedFlights.filter((flight) => plannedFlightIds.has(flight.id)).length,
    exceptionFlights: expectedFlights.filter((flight) => exceptionFlightIds.has(flight.id)),
    missingFlights: expectedFlights.filter((flight) => !plannedFlightIds.has(flight.id) && !exceptionFlightIds.has(flight.id)),
  };
}

function operationTypeForFlightAssignment(flight: FlightAssignment) {
  return categoryForAircraft(flight.aircraft) === "regional" ? "express" : "mainline";
}

function lunchWindowHoursForFlights(flights: FlightAssignment[], rules: PlanningRules) {
  const sites = new Set(flights.map((flight) => flight.originAirport?.toUpperCase()).filter(Boolean));
  if (sites.size !== 1) return undefined;
  const [siteCode] = [...sites];
  if (!siteCode) return undefined;
  const siteRules = rules.siteOverrides?.[siteCode];
  if (siteRules?.lunchWindowStartHour === undefined || siteRules.lunchWindowEndHour === undefined) return undefined;
  return { startHour: siteRules.lunchWindowStartHour, endHour: siteRules.lunchWindowEndHour };
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

function waitForPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
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

function limitDriverDisplayStartWaves(drivers: Driver[], pushes: Push[], maxAllowedStartTimes: number, rules: PlanningRules) {
  const startTimeLimit = Math.max(minShiftBidStartTimes, Math.min(maxShiftBidStartTimes, maxAllowedStartTimes));
  const waves = createStartWaves(pushes, drivers).map((wave) => ({ ...wave, minutes: timeToMinutes(wave.startTime) }));
  if (waves.length <= startTimeLimit) return drivers;

  const startAliases = new Map(waves.map((wave) => [wave.startTime, wave.startTime]));

  while (waves.length > startTimeLimit) {
    const mergeIndex = lowestVolumeMergeableWaveIndex(waves);
    const removedWave = waves[mergeIndex];
    const neighborIndex = nearestWaveIndex(waves, mergeIndex);
    const targetWave = waves[neighborIndex];

    for (const [startTime, alias] of startAliases.entries()) {
      if (alias === removedWave.startTime) startAliases.set(startTime, targetWave.startTime);
    }
    startAliases.set(removedWave.startTime, targetWave.startTime);
    targetWave.driverStarts += removedWave.driverStarts;
    waves.splice(mergeIndex, 1);
  }

  const shiftSpanMinutes = rules.standardShiftHours * 60 + rules.lunchMinutes;
  return drivers.map((driver) => {
    const currentDisplayStart = driver.displayShiftStart ?? driver.shiftStart;
    const displayShiftStart = startAliases.get(currentDisplayStart) ?? currentDisplayStart;
    return {
      ...driver,
      displayShiftStart,
      displayShiftEnd: addMinutes(displayShiftStart, shiftSpanMinutes),
    };
  });
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

function createFixedStartPlanningResources(shiftStarts: string[], rules: PlanningRules) {
  return createTargetResources(shiftStarts, targetResourcesPerStart, createTargetTruckPool(), rules, { preserveExactStarts: true });
}

function createFixedResourcePlanningResources(fixedStartResources: FixedStartResource[], rules: PlanningRules) {
  const shiftSpanMinutes = rules.standardShiftHours * 60 + rules.lunchMinutes;
  const sortedResources = [...fixedStartResources]
    .map((item) => ({ ...item, resources: Math.max(0, Math.floor(item.resources)) }))
    .filter((item) => item.resources > 0)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  let resourceNumber = 0;
  return {
    drivers: sortedResources.flatMap((item) => Array.from({ length: item.resources }, (_, index): Driver => {
      resourceNumber += 1;
      const shiftStart = item.startTime;
      const displayShiftStart = displayStartForShiftStart(shiftStart);
      const shiftEnd = actualEndForShiftStart(shiftStart, addMinutes(shiftStart, shiftSpanMinutes));
      const displayShiftEnd = displayEndForShiftStart(shiftStart, shiftEnd);
      const idSuffix = `${idPrefixForShiftStart(shiftStart)}-${index + 1}`;
      return {
        id: `d-goal-${idSuffix}`,
        name: `Goal Driver ${String(resourceNumber).padStart(3, "0")}`,
        truck: String(5100 + resourceNumber).padStart(4, "0"),
        radio: String(500 + resourceNumber).padStart(3, "0"),
        shiftStart,
        shiftEnd,
        displayShiftStart,
        displayShiftEnd,
      };
    })),
    helpers: sortedResources.flatMap((item) => Array.from({ length: item.resources }, (_, index): Helper => {
      const shiftStart = item.startTime;
      const displayShiftStart = displayStartForShiftStart(shiftStart);
      const shiftEnd = actualEndForShiftStart(shiftStart, addMinutes(shiftStart, shiftSpanMinutes));
      const displayShiftEnd = displayEndForShiftStart(shiftStart, shiftEnd);
      const idSuffix = `${idPrefixForShiftStart(shiftStart)}-${index + 1}`;
      return {
        id: `h-goal-${idSuffix}`,
        name: `Goal Helper ${shiftStart} ${String(index + 1).padStart(2, "0")}`,
        shiftStart,
        shiftEnd,
        displayShiftStart,
        displayShiftEnd,
      };
    })),
    trucks: createTargetTruckPool(),
  };
}

function createTargetResources(
  shiftStarts: string[],
  resourcesPerStart: number,
  trucks: ReturnType<typeof createTargetTruckPool> | typeof mockTrucks,
  rules: PlanningRules,
  options: { preserveExactStarts?: boolean } = {},
) {
  const shiftSpanMinutes = rules.standardShiftHours * 60 + rules.lunchMinutes;
  const normalizedStarts = options.preserveExactStarts ? exactShiftStarts(shiftStarts) : normalizedShiftStarts(shiftStarts);
  return {
    drivers: normalizedStarts.flatMap((shiftStart, shiftIndex) => Array.from({ length: resourcesPerStart }, (_, index): Driver => {
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
    helpers: normalizedStarts.flatMap((shiftStart, shiftIndex) => Array.from({ length: resourcesPerStart }, (_, index): Helper => {
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

const earliestGeneratedDayStartMinutes = 0;
const overnightCoverageStart = "00:00";
const overnightCoverageEnd = "03:00";
const overnightCoverageEndNextDay = "27:00";
const overnightDisplayStart = "18:30";

function normalizedShiftStarts(shiftStarts: string[]) {
  return [...new Set(shiftStarts.map(normalizedShiftStart))]
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

function exactShiftStarts(shiftStarts: string[]) {
  return [...new Set(shiftStarts)]
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
