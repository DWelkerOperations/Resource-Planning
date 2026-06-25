import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Driver, Push, RiskSeverity, ServiceEvent } from "../../types/dispatch";
import { resourceIds } from "../../utils/resources";
import { useTimelineScale } from "./TimelineScaleContext";
import { minutesFromStart, pixelsPerMinute, serviceLabels, serviceStyle, timeToMinutes } from "./timelineUtils";

const kitchenUnloadMinutes = 15;

type ManualDragRect = { left: number; top: number; width: number; height: number; right: number; bottom: number };

type PushBlockProps = {
  push: Push;
  driver?: Driver;
  shiftLabel?: string;
  manualControlActive?: boolean;
  onManualFlightDrop?: (change: { flightId: string; targetPushId: string; targetSequence: number }) => void;
};

export function PushBlock({ push, driver, shiftLabel, manualControlActive = false, onManualFlightDrop }: PushBlockProps) {
  const scale = useTimelineScale();
  const { attributes: pushAttributes, listeners: pushListeners, setNodeRef: setPushDragRef, transform: pushTransform, isDragging: pushIsDragging } = useDraggable({
    id: `push-time:${push.id}`,
    data: { kind: "push-time-drag", pushId: push.id },
    disabled: !manualControlActive,
  });
  const { isOver: pushIsOver, setNodeRef: setPushDropRef } = useDroppable({
    id: `manual-push:${push.id}:append`,
    data: { kind: "manual-push-drop", pushId: push.id, sequence: push.flights.length },
    disabled: !manualControlActive,
  });
  const setPushNodeRef = (node: HTMLElement | null) => {
    setPushDragRef(node);
    setPushDropRef(node);
  };
  const minuteWidth = pixelsPerMinute * scale;
  const loadLeft = minutesFromStart(push.loadStartTime) * minuteWidth;
  const loadWidth = Math.max(24, push.loadDurationMinutes * minuteWidth);
  const left = minutesFromStart(push.kitchenDepartureTime) * minuteWidth;
  const width = Math.max(40, push.totalDurationMinutes * minuteWidth);
  const start = timeToMinutes(push.kitchenDepartureTime);
  const firstServiceStart = Math.min(...push.serviceEvents.map((event) => timeToMinutes(event.serviceStart)));
  const gateWaitMinutes = Math.max(0, firstServiceStart - timeToMinutes(push.arriveFirstGateTime));
  const releaseTime = minutesToTime(timeToMinutes(push.returnTime) + kitchenUnloadMinutes);
  const assignedDriverCount = resourceIds(push.driverId).length;
  const assignedTruckCount = resourceIds(push.truckId).length;
  const multiTruckPush = assignedDriverCount > 1 || assignedTruckCount > 1;
  const tone = pushRiskTone[push.riskSeverity];

  return (
    <>
      {push.loadDurationMinutes > 0 && (
        <div
          className="group/load absolute top-1.5 z-20 flex h-5 items-center justify-center rounded-sm border border-slate-300 bg-white/90 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.45)_0,rgba(148,163,184,0.45)_3px,transparent_3px,transparent_6px)] px-1 text-[9px] font-semibold text-slate-700 shadow-sm"
          style={{ left: loadLeft, width: loadWidth }}
          title={`Load/prep ${push.loadStartTime}-${push.loadEndTime}`}
        >
          <span className="truncate">Load</span>
        </div>
      )}
      <div
        ref={setPushNodeRef}
        data-manual-push-id={push.id}
        data-manual-push-sequence={push.flights.length}
        className={`group/push absolute top-1 z-30 h-7 rounded-lg border shadow-sm hover:z-[900] ${tone} ${push.modifiedByManualControl ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${pushIsOver ? "outline outline-2 outline-emerald-400 outline-offset-2" : ""} ${pushIsDragging ? "z-[1100] opacity-80 shadow-xl" : ""}`}
        style={{ left, width, transform: CSS.Translate.toString(pushTransform) }}
      >
        <div
          className={`group/label absolute inset-y-0 left-0 z-[980] flex min-w-[44px] items-center px-2 text-[11px] font-semibold ${manualControlActive ? "cursor-grab active:cursor-grabbing" : ""}`}
          {...(manualControlActive ? pushListeners : {})}
          {...(manualControlActive ? pushAttributes : {})}
        >
          <span className="rounded bg-white/85 px-1 shadow-sm">{push.id}</span>
          {push.modifiedByManualControl && <span className="ml-1 rounded bg-blue-600 px-1 text-[9px] uppercase text-white">Manual</span>}
          <div className="pointer-events-none absolute left-0 top-8 z-[2000] hidden w-80 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-600 shadow-2xl group-hover/label:block">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">{push.id}</div>
                <div className="mt-0.5 text-slate-500">{push.flights.map((flight) => `${flight.flightNumber} ${flight.gate}`).join(" · ")}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${riskBadgeTone[push.riskSeverity]}`}>
                {riskLabel[push.riskSeverity]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
              <span>Load/prep</span><strong className="text-right text-slate-800">{push.loadStartTime}-{push.loadEndTime}</strong>
              <span>Dispatch depart</span><strong className="text-right text-slate-800">{push.kitchenDepartureTime}</strong>
              <span>Arrive first gate</span><strong className="text-right text-slate-800">{push.arriveFirstGateTime}</strong>
              {gateWaitMinutes > 0 && <><span>Gate wait</span><strong className="text-right text-slate-800">{gateWaitMinutes} min</strong></>}
              {multiTruckPush && (
                <>
                  <span>Widebody resources</span><strong className="text-right text-slate-800">{assignedTruckCount || 2} trucks · {assignedDriverCount || 2} drivers</strong>
                </>
              )}
              <span>Return site</span><strong className="text-right text-slate-800">{push.returnTime}</strong>
              <span>Release after unload</span><strong className="text-right text-slate-800">{releaseTime}</strong>
              <span>Push duration</span><strong className="text-right text-slate-800">{push.totalDurationMinutes} min</strong>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="mb-1 font-semibold text-ink">Service windows</div>
              <div className="space-y-1">
                {push.serviceEvents.map((event) => (
                  <div key={event.flightId} className="grid grid-cols-[1fr_auto] gap-3">
                    <span className="truncate">{event.flightNumber} · Gate {event.gate}</span>
                    <strong className="text-slate-800">{event.serviceStart}-{event.serviceEnd}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {push.serviceEvents.map((event) => (
          <PushServiceTask
            key={event.flightId}
            driver={driver}
            event={event}
            minuteWidth={minuteWidth}
            push={push}
            pushStartMinutes={start}
            shiftLabel={shiftLabel}
            manualControlActive={manualControlActive}
            onManualFlightDrop={onManualFlightDrop}
          />
        ))}
      </div>
    </>
  );
}

function PushServiceTask({
  driver,
  event,
  minuteWidth,
  push,
  pushStartMinutes,
  shiftLabel,
  manualControlActive,
  onManualFlightDrop,
}: {
  driver?: Driver;
  event: ServiceEvent;
  minuteWidth: number;
  push: Push;
  pushStartMinutes: number;
  shiftLabel?: string;
  manualControlActive?: boolean;
  onManualFlightDrop?: (change: { flightId: string; targetPushId: string; targetSequence: number }) => void;
}) {
  const manualDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startRect: ManualDragRect;
  } | null>(null);
  const [manualDragRect, setManualDragRect] = useState<ManualDragRect | null>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `push-task:${push.id}:${event.flightId}`,
    data: { kind: "push-service-task", flightId: event.flightId, pushId: push.id },
    disabled: manualControlActive,
  });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `manual-push:${push.id}:${event.flightId}`,
    data: { kind: "manual-push-drop", pushId: push.id, sequence: event.currentSequence ?? push.serviceEvents.findIndex((item) => item.flightId === event.flightId) },
    disabled: !manualControlActive,
  });
  const setTaskNodeRef = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDropRef(node);
  };
  const eventLeft = (timeToMinutes(event.serviceStart) - pushStartMinutes) * minuteWidth;
  const eventWidth = Math.max(manualControlActive ? 72 : 30, event.serviceDurationMinutes * minuteWidth);
  const eventRiskTone = eventRiskRing[event.riskSeverity];
  const sequence = event.currentSequence ?? push.serviceEvents.findIndex((item) => item.flightId === event.flightId);

  function handleManualPointerDown(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
    if (!manualControlActive || !onManualFlightDrop) {
      listeners?.onPointerDown?.(pointerEvent);
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    const rect = pointerEvent.currentTarget.getBoundingClientRect();
    const startRect = rectFromBounds(rect.left, rect.top, rect.width, rect.height);
    manualDragRef.current = {
      pointerId: pointerEvent.pointerId,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      currentX: pointerEvent.clientX,
      currentY: pointerEvent.clientY,
      startRect,
    };
    setManualDragRect(startRect);
  }

  function handleManualPointerMove(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
    const currentDrag = manualDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== pointerEvent.pointerId) return;

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    currentDrag.currentX = pointerEvent.clientX;
    currentDrag.currentY = pointerEvent.clientY;
    setManualDragRect(rectFromBounds(
      currentDrag.startRect.left + pointerEvent.clientX - currentDrag.startX,
      currentDrag.startRect.top + pointerEvent.clientY - currentDrag.startY,
      currentDrag.startRect.width,
      currentDrag.startRect.height,
    ));
  }

  function handleManualPointerUp(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
    const currentDrag = manualDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== pointerEvent.pointerId) return;

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    manualDragRef.current = null;

    const movedPixels = Math.hypot(pointerEvent.clientX - currentDrag.startX, pointerEvent.clientY - currentDrag.startY);
    const finalRect = rectFromBounds(
      currentDrag.startRect.left + pointerEvent.clientX - currentDrag.startX,
      currentDrag.startRect.top + pointerEvent.clientY - currentDrag.startY,
      currentDrag.startRect.width,
      currentDrag.startRect.height,
    );
    setManualDragRect(null);
    if (movedPixels < 8) return;

    const target = manualDropTargetFromDraggedRect(finalRect, pointerEvent.clientX, pointerEvent.clientY, event.flightId, push.id);
    if (!target || !onManualFlightDrop) return;
    onManualFlightDrop({ flightId: event.flightId, targetPushId: target.pushId, targetSequence: target.sequence });
  }

  const taskClassName = `group/event absolute top-1 flex h-5 cursor-grab touch-none select-none items-center justify-center gap-1 rounded-md border px-1 text-[10px] font-semibold shadow-sm transition active:cursor-grabbing hover:z-[1050] ${manualControlActive ? "z-[1000]" : "z-40"} ${serviceStyle(event.serviceType)} ${eventRiskTone} ${event.modifiedByManualControl ? "ring-2 ring-blue-600 ring-offset-1" : ""} ${isOver ? "outline outline-2 outline-emerald-500 outline-offset-1" : ""} ${isDragging || manualDragRect ? "z-[1100] opacity-80 shadow-lg" : ""}`;

  return (
    <>
      <button
        ref={setTaskNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        data-push-task-flight-id={event.flightId}
        data-push-task-sequence={sequence}
        data-push-task-service-type={event.serviceType}
        title={manualControlActive ? `Drag ${event.flightNumber} to another push` : `${event.flightNumber} ${serviceLabels[event.serviceType]}`}
        onPointerDown={handleManualPointerDown}
        onPointerMove={handleManualPointerMove}
        onPointerUp={handleManualPointerUp}
        onPointerCancel={() => {
          manualDragRef.current = null;
          setManualDragRect(null);
        }}
        className={taskClassName}
        style={{
          left: eventLeft,
          width: eventWidth,
          opacity: manualDragRect ? 0.2 : undefined,
          transform: CSS.Translate.toString(transform),
        }}
      >
        <span className="flex h-full w-4 shrink-0 items-center justify-center rounded bg-white/60">
          <GripVertical size={12} className="opacity-70" />
        </span>
        <span className="truncate">{event.flightNumber} {event.gate}</span>
        {event.modifiedByManualControl && <span className="ml-0.5 rounded bg-white/80 px-0.5 text-[8px] uppercase text-blue-800">M</span>}
        <div className="pointer-events-none absolute left-0 top-7 z-[999] hidden w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-600 shadow-xl group-hover/event:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-ink">{event.flightNumber}</div>
              <div className="mt-0.5 text-slate-500">Gate {event.gate} · {event.aircraftType}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{serviceLabels[event.serviceType]}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Destination</span><strong className="text-right text-slate-800">{event.destinationAirport ?? "Domestic"}</strong>
            <span>Aircraft arrival</span><strong className="text-right text-slate-800">{event.aircraftArrivalTime}</strong>
            <span>Departure</span><strong className="text-right text-slate-800">{event.departureTime}</strong>
            <span>Task type</span><strong className="text-right text-slate-800">{serviceLabels[event.serviceType]}</strong>
            <span>Service</span><strong className="text-right text-slate-800">{event.serviceStart}-{event.serviceEnd}</strong>
            <span>Duration</span><strong className="text-right text-slate-800">{event.serviceDurationMinutes} min</strong>
            <span>Timing</span><strong className="text-right text-slate-800">{event.riskStatus.split("-").join(" ")}</strong>
            <span>Risk level</span><strong className="text-right text-slate-800">{riskLabel[event.riskSeverity]}</strong>
            <span>Push</span><strong className="text-right text-slate-800">{push.id}</strong>
            <span>Driver shift</span><strong className="text-right text-slate-800">{shiftLabel ?? (driver ? `${driver.displayShiftStart ?? driver.shiftStart}-${driver.displayShiftEnd ?? driver.shiftEnd}` : "Open")}</strong>
          </div>
        </div>
      </button>
      {manualDragRect && createPortal(
        <div
          className={`pointer-events-none fixed z-[9999] flex h-5 items-center justify-center gap-1 rounded-md border px-1 text-[10px] font-semibold shadow-2xl ${serviceStyle(event.serviceType)} ${eventRiskTone}`}
          style={{
            left: manualDragRect.left,
            top: manualDragRect.top,
            width: manualDragRect.width,
          }}
        >
          <GripVertical size={10} className="shrink-0 opacity-60" />
          <span className="truncate">{event.flightNumber} {event.gate}</span>
        </div>,
        document.body,
      )}
    </>
  );
}

function rectFromBounds(left: number, top: number, width: number, height: number): ManualDragRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function manualDropTargetFromDraggedRect(draggedRect: ManualDragRect, clientX: number, clientY: number, activeFlightId: string, activePushId: string) {
  const overlapTarget = bestManualDropTargetFromRect(draggedRect, activePushId);
  return overlapTarget ?? manualDropTargetFromPoint(clientX, clientY, activeFlightId, activePushId);
}

function bestManualDropTargetFromRect(draggedRect: ManualDragRect, activePushId: string) {
  let bestTarget: { pushId: string; sequence: number; overlapArea: number } | null = null;
  for (const pushElement of document.querySelectorAll<HTMLElement>("[data-manual-push-id]")) {
    if (pushElement.dataset.manualPushId === activePushId) continue;
    const rect = pushElement.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(draggedRect.right, rect.right) - Math.max(draggedRect.left, rect.left));
    const overlapHeight = Math.max(0, Math.min(draggedRect.bottom, rect.bottom) - Math.max(draggedRect.top, rect.top));
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea > 0 && (!bestTarget || overlapArea > bestTarget.overlapArea)) {
      bestTarget = {
        pushId: pushElement.dataset.manualPushId ?? "",
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
        overlapArea,
      };
    }
  }
  return bestTarget;
}

function manualDropTargetFromPoint(clientX: number, clientY: number, activeFlightId: string, activePushId: string) {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const element of elements) {
    const taskElement = element.closest<HTMLElement>("[data-push-task-flight-id]");
    if (taskElement && taskElement.dataset.pushTaskFlightId !== activeFlightId) {
      const pushElement = taskElement.closest<HTMLElement>("[data-manual-push-id]");
      if (pushElement?.dataset.manualPushId && pushElement.dataset.manualPushId !== activePushId) {
        return {
          pushId: pushElement.dataset.manualPushId,
          sequence: Number(taskElement.dataset.pushTaskSequence ?? 0),
        };
      }
    }

    const pushElement = element.closest<HTMLElement>("[data-manual-push-id]");
    if (pushElement?.dataset.manualPushId && pushElement.dataset.manualPushId !== activePushId) {
      return {
        pushId: pushElement.dataset.manualPushId,
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
      };
    }
  }

  for (const pushElement of document.querySelectorAll<HTMLElement>("[data-manual-push-id]")) {
    if (pushElement.dataset.manualPushId === activePushId) continue;
    const rect = pushElement.getBoundingClientRect();
    const isInsidePush = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (isInsidePush) {
      return {
        pushId: pushElement.dataset.manualPushId ?? "",
        sequence: Number(pushElement.dataset.manualPushSequence ?? 0),
      };
    }
  }

  return null;
}

function minutesToTime(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

const pushRiskTone: Record<RiskSeverity, string> = {
  normal: "border-blue-300 bg-blue-50 text-blue-950",
  watch: "border-amber-400 bg-blue-50 text-blue-950 shadow-amber-100",
  urgent: "border-red-500 bg-blue-50 text-blue-950 shadow-red-100 ring-2 ring-red-200",
  critical: "border-red-700 bg-red-50 text-red-950 shadow-red-200 ring-2 ring-red-300",
};

const eventRiskRing: Record<RiskSeverity, string> = {
  normal: "ring-1 ring-white/60",
  watch: "ring-2 ring-amber-300",
  urgent: "ring-2 ring-red-500",
  critical: "ring-2 ring-red-800",
};

const riskBadgeTone: Record<RiskSeverity, string> = {
  normal: "bg-emerald-100 text-emerald-700",
  watch: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-700",
  critical: "bg-red-700 text-white",
};

const riskLabel: Record<RiskSeverity, string> = {
  normal: "Normal",
  watch: "Watch",
  urgent: "Urgent",
  critical: "Critical",
};
