import { DndContext, pointerWithin, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { mockDrivers } from "../../data/mockDrivers";
import { mockFlights } from "../../data/mockFlights";
import type { Driver, FlightAssignment, Push, ServiceType } from "../../types/dispatch";
import { snapToFiveMinutes } from "../../engine/manualControl";
import type { FlightTaskTypeChange } from "../../utils/taskTypeUpdates";
import { Panel } from "../ui/Panel";
import { DriverColumn } from "./DriverColumn";
import { OpenFlightsLane } from "./OpenFlightsLane";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineLegend } from "./TimelineLegend";
import { TimelineScaleContext } from "./TimelineScaleContext";
import { pixelsPerMinute, serviceLabels, serviceStyle, timelineWidth } from "./timelineUtils";

export function DispatcherTimeline({
  flights: sourceFlights = mockFlights,
  drivers = mockDrivers,
  pushes = [],
  driverLabelMode = "actual",
  showDriverRadio = true,
  onTaskTypeChange,
  manualControlActive = false,
  onPushTimeChange,
  onFlightMove,
}: {
  flights?: FlightAssignment[];
  drivers?: Driver[];
  pushes?: Push[];
  driverLabelMode?: "actual" | "sequential";
  showDriverRadio?: boolean;
  onTaskTypeChange?: (change: FlightTaskTypeChange) => void;
  manualControlActive?: boolean;
  onPushTimeChange?: (change: { pushId: string; deltaMinutes: number }) => void;
  onFlightMove?: (change: { flightId: string; targetPushId: string; targetSequence: number }) => void;
}) {
  const [flights, setFlights] = useState<FlightAssignment[]>(sourceFlights);
  const [timelineScale, setTimelineScale] = useState(1);

  useEffect(() => {
    setFlights(sourceFlights);
  }, [sourceFlights]);

  function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (activeData?.kind === "push-service-task" && overData?.kind === "task-type-drop-zone") {
      onTaskTypeChange?.({
        flightId: String(activeData.flightId),
        serviceType: overData.serviceType as ServiceType,
      });
      return;
    }

    if (manualControlActive && activeData?.kind === "push-service-task") {
      const manualWindow = window as typeof window & { __manualFlightDropHandled?: { flightId: string; handledAt: number } };
      const handledDrop = manualWindow.__manualFlightDropHandled;
      if (handledDrop?.flightId === String(activeData.flightId) && Date.now() - handledDrop.handledAt < 1000) return;

      const rectDropData = manualDropDataFromDraggedRect(event, String(activeData.pushId));
      const pointDropData = manualDropDataFromPoint(event, String(activeData.flightId), String(activeData.pushId));
      const manualDropData = rectDropData ?? pointDropData ?? (overData?.kind === "manual-push-drop" ? overData : null);
      if (!manualDropData) return;
      if (String(manualDropData.pushId) === String(activeData.pushId)) return;
      onFlightMove?.({
        flightId: String(activeData.flightId),
        targetPushId: String(manualDropData.pushId),
        targetSequence: Number(manualDropData.sequence ?? 0),
      });
      return;
    }

    if (manualControlActive && activeData?.kind === "push-time-drag") {
      const deltaMinutes = snapToFiveMinutes(event.delta.x / (pixelsPerMinute * timelineScale));
      onPushTimeChange?.({ pushId: String(activeData.pushId), deltaMinutes });
      return;
    }

    const flightId = String(activeData?.flightId ?? event.active.id);
    const newDriverId = event.over?.id ? String(event.over.id) : null;
    if (!newDriverId) return;
    setFlights((currentFlights) => currentFlights.map((flight) => flight.id === flightId ? { ...flight, driverId: newDriverId, edited: true } : flight));
  }

  const assignedFlights = flights.filter((flight) => flight.driverId);
  const openFlights = flights.filter((flight) => !flight.driverId);
  const assignedPushes = pushes.filter((push) => push.driverId);
  const openPushes = pushes.filter((push) => !push.driverId);
  const workBlockCount = pushes.length > 0 ? pushes.length : assignedFlights.length;
  const openItemCount = pushes.length > 0 ? openPushes.length : openFlights.length;
  const zoomPercent = Math.round(timelineScale * 100);
  const riskCounts = {
    watch: pushes.filter((push) => push.riskSeverity === "watch").length,
    urgent: pushes.filter((push) => push.riskSeverity === "urgent").length,
    critical: pushes.filter((push) => push.riskSeverity === "critical").length,
  };

  return (
    <DndContext collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <TimelineScaleContext.Provider value={timelineScale}>
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-ink">Driver Timeline</h2>
            <p className="mt-0.5 text-xs text-slate-500">Driver pairing view · {workBlockCount} planned push blocks · {openItemCount} open items</p>
          </div>
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold text-slate-600 shadow-sm">
            <button
              type="button"
              onClick={() => setTimelineScale((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}
              className="h-7 w-7 rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
              aria-label="Zoom timeline out"
            >
              -
            </button>
            <span className="w-12 text-center">{zoomPercent}%</span>
            <button
              type="button"
              onClick={() => setTimelineScale((current) => Math.min(1.35, Number((current + 0.1).toFixed(2))))}
              className="h-7 w-7 rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
              aria-label="Zoom timeline in"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Shift span visible</span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">Overflow visible</span>
          </div>
        </div>
        <TimelineRiskNotice watch={riskCounts.watch} urgent={riskCounts.urgent} critical={riskCounts.critical} />
        {onTaskTypeChange && <TaskTypeDropZoneBar />}
        <TimelineLegend />
        <div className="overflow-auto">
          <div style={{ minWidth: 380 + timelineWidth(timelineScale) }}>
            <TimelineHeader showDriverRadio={showDriverRadio} />
            <div className="flex"><DriverColumn drivers={drivers} pushes={assignedPushes} driverLabelMode={driverLabelMode} showRadio={showDriverRadio} /><TimelineGrid drivers={drivers} flights={pushes.length > 0 ? [] : assignedFlights} pushes={assignedPushes} manualControlActive={manualControlActive} onManualFlightDrop={onFlightMove} /></div>
            {openItemCount > 0 && <OpenFlightsLane flights={pushes.length > 0 ? [] : openFlights} pushes={openPushes} manualControlActive={manualControlActive} onManualFlightDrop={onFlightMove} />}
          </div>
        </div>
      </Panel>
      </TimelineScaleContext.Provider>
    </DndContext>
  );
}

function manualDropDataFromDraggedRect(event: DragEndEvent, activePushId: string) {
  const rect = event.active.rect.current.initial;
  if (!rect) return null;

  const draggedRect = {
    left: rect.left + event.delta.x,
    right: rect.left + event.delta.x + rect.width,
    top: rect.top + event.delta.y,
    bottom: rect.top + event.delta.y + rect.height,
  };

  let bestTarget: { pushId: string; sequence: number; overlapArea: number } | null = null;
  for (const pushElement of document.querySelectorAll<HTMLElement>("[data-manual-push-id]")) {
    if (pushElement.dataset.manualPushId === activePushId) continue;
    const pushRect = pushElement.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(draggedRect.right, pushRect.right) - Math.max(draggedRect.left, pushRect.left));
    const overlapHeight = Math.max(0, Math.min(draggedRect.bottom, pushRect.bottom) - Math.max(draggedRect.top, pushRect.top));
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea > 0 && (!bestTarget || overlapArea > bestTarget.overlapArea)) {
      bestTarget = {
        pushId: pushElement.dataset.manualPushId ?? "",
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
        overlapArea,
      };
    }
  }

  if (!bestTarget) return null;
  return {
    kind: "manual-push-drop",
    pushId: bestTarget.pushId,
    sequence: bestTarget.sequence,
  };
}

function manualDropDataFromPoint(event: DragEndEvent, activeFlightId: string, activePushId: string) {
  const rect = event.active.rect.current.initial;
  if (!rect) return null;

  const centerX = rect.left + event.delta.x + rect.width / 2;
  const centerY = rect.top + event.delta.y + rect.height / 2;
  const elements = document.elementsFromPoint(centerX, centerY);

  for (const element of elements) {
    const taskElement = element.closest<HTMLElement>("[data-push-task-flight-id]");
    if (taskElement && taskElement.dataset.pushTaskFlightId !== activeFlightId) {
      const pushElement = taskElement.closest<HTMLElement>("[data-manual-push-id]");
      if (pushElement?.dataset.manualPushId && pushElement.dataset.manualPushId !== activePushId) {
        return {
          kind: "manual-push-drop",
          pushId: pushElement.dataset.manualPushId,
          sequence: Number(taskElement.dataset.pushTaskSequence ?? 0),
        };
      }
    }

    const pushElement = element.closest<HTMLElement>("[data-manual-push-id]");
    if (pushElement?.dataset.manualPushId && pushElement.dataset.manualPushId !== activePushId) {
      return {
        kind: "manual-push-drop",
        pushId: pushElement.dataset.manualPushId,
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
      };
    }
  }

  for (const pushElement of document.querySelectorAll<HTMLElement>("[data-manual-push-id]")) {
    if (pushElement.dataset.manualPushId === activePushId) continue;
    const pushRect = pushElement.getBoundingClientRect();
    const isInsidePush = centerX >= pushRect.left && centerX <= pushRect.right && centerY >= pushRect.top && centerY <= pushRect.bottom;
    if (isInsidePush) {
      return {
        kind: "manual-push-drop",
        pushId: pushElement.dataset.manualPushId ?? "",
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
      };
    }
  }

  return null;
}

const editableTaskTypes: ServiceType[] = ["load-ua", "load-other", "intl-strip", "other-work", "positioning", "unplanned"];

function TaskTypeDropZoneBar() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Task type</span>
      {editableTaskTypes.map((serviceType) => <TaskTypeDropZone key={serviceType} serviceType={serviceType} />)}
    </div>
  );
}

function TaskTypeDropZone({ serviceType }: { serviceType: ServiceType }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `task-type:${serviceType}`,
    data: { kind: "task-type-drop-zone", serviceType },
  });

  return (
    <div
      ref={setNodeRef}
      data-task-type-dropzone={serviceType}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${serviceStyle(serviceType)} ${isOver ? "scale-[1.02] ring-2 ring-ink ring-offset-1" : ""}`}
    >
      {serviceLabels[serviceType]}
    </div>
  );
}

function TimelineRiskNotice({ watch, urgent, critical }: { watch: number; urgent: number; critical: number }) {
  const total = watch + urgent + critical;
  if (total === 0) return null;

  const elevated = critical + urgent;
  const tone = elevated > 0
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-5 py-2 text-xs font-medium ${tone}`}>
      <span>
        {elevated > 0 ? "Action needed" : "Watch items"}: {critical} critical · {urgent} urgent · {watch} watch push{total === 1 ? "" : "es"}
      </span>
      <span className="text-[11px] opacity-80">Outlined blocks show timing, coverage, aircraft, or shift-risk exceptions.</span>
    </div>
  );
}
