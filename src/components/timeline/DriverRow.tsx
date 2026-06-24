import { useDroppable } from "@dnd-kit/core";
import type { Driver, FlightAssignment, Push } from "../../types/dispatch";
import { FlightPuck } from "./FlightPuck";
import { PushBlock } from "./PushBlock";
import { minutesToTime, plannedShiftForDriver } from "./shiftPlanning";
import { useTimelineScale } from "./TimelineScaleContext";
import { minutesFromStart, pixelsPerMinute, rowHeight, timeToMinutes, timelineEnd, timelineStart, timelineWidth } from "./timelineUtils";

export function DriverRow({ driver, flights, pushes = [] }: { driver: Driver; flights: FlightAssignment[]; pushes?: Push[] }) {
  const scale = useTimelineScale();
  const minuteWidth = pixelsPerMinute * scale;
  const { setNodeRef, isOver } = useDroppable({ id: driver.id });
  const plannedShift = plannedShiftForDriver(driver, pushes);
  const shiftStart = Math.max(0, (plannedShift.startMinutes - timeToMinutes(timelineStart)) * minuteWidth);
  const shiftEnd = Math.min(timelineWidth(scale), (plannedShift.endMinutes - timeToMinutes(timelineStart)) * minuteWidth);
  const overflowStart = shiftEnd;
  const overflowEnd = Math.min(timelineWidth(scale), (plannedShift.activeEndMinutes - timeToMinutes(timelineStart)) * minuteWidth);
  const rowMinutes = timeToMinutes(timelineEnd) - timeToMinutes(timelineStart);
  const lunch = scheduledLunch(pushes, plannedShift);

  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-slate-100 transition ${isOver ? "bg-blue-50 ring-2 ring-inset ring-blue-300" : "bg-white"}`}
      style={{ height: rowHeight, width: timelineWidth(scale) }}
    >
      <div className="absolute inset-y-0 left-0 bg-slate-50" style={{ width: shiftStart }} />
      <div className="absolute top-1 bottom-1 rounded-lg border border-emerald-200 bg-emerald-50/80" style={{ left: shiftStart, width: Math.max(0, shiftEnd - shiftStart) }}>
        <div className="absolute inset-y-0 left-0 w-2 rounded-l-lg bg-emerald-300/80" />
      </div>
      {plannedShift.overflowMinutes > 0 && (
        <div
          className="absolute top-1 bottom-1 rounded-r-lg border border-red-300 bg-red-100/90"
          style={{ left: overflowStart, width: Math.max(0, overflowEnd - overflowStart) }}
        >
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.2)_0,rgba(248,113,113,0.2)_6px,transparent_6px,transparent_12px)]" />
        </div>
      )}
      {Array.from({ length: Math.floor(rowMinutes / 30) + 1 }).map((_, index) => (
        <div
          key={index}
          className={`pointer-events-none absolute inset-y-0 z-0 border-l ${index % 2 === 0 ? "border-dashed border-slate-300/70" : "border-dashed border-slate-200/80"}`}
          style={{ left: index * 30 * minuteWidth }}
        />
      ))}
      {lunch && <LunchBlock lunch={lunch} minuteWidth={minuteWidth} />}
      {pushes.map((push) => <PushBlock key={push.id} push={push} driver={driver} shiftLabel={`${plannedShift.start}-${plannedShift.end}`} />)}
      {flights.map((flight) => <FlightPuck key={flight.id} flight={flight} driver={driver} />)}
    </div>
  );
}

type LunchWindow = { start: string; end: string; minutes: number };

function LunchBlock({ lunch, minuteWidth }: { lunch: LunchWindow; minuteWidth: number }) {
  return (
    <div
      className="absolute top-1.5 z-[70] flex h-6 items-center justify-center rounded-full border border-slate-400 bg-white px-2 text-[10px] font-semibold text-slate-700 shadow-sm"
      title={`Lunch ${lunch.start}-${lunch.end}`}
      style={{
        left: minutesFromStart(lunch.start) * minuteWidth,
        width: Math.max(38, lunch.minutes * minuteWidth),
      }}
    >
      Lunch
    </div>
  );
}

function scheduledLunch(pushes: Push[], plannedShift: ReturnType<typeof plannedShiftForDriver>): LunchWindow | null {
  const lunchMinutes = 30;
  const sortedPushes = [...pushes].sort((a, b) => timeToMinutes(a.kitchenDepartureTime) - timeToMinutes(b.kitchenDepartureTime));
  const lunchStart = lunchInsideShift(sortedPushes, plannedShift.startMinutes, plannedShift.endMinutes, lunchMinutes);
  if (lunchStart === null) return null;

  return {
    start: minutesToTime(lunchStart),
    end: minutesToTime(lunchStart + lunchMinutes),
    minutes: lunchMinutes,
  };
}

function lunchInsideShift(pushes: Push[], shiftStart: number, shiftEnd: number, lunchMinutes: number) {
  const kitchenUnloadMinutes = 15;
  let bestGap: { start: number; end: number; idleMinutes: number } | null = null;
  let availableStart = shiftStart;

  for (const push of pushes) {
    const pushDeparture = timeToMinutes(push.loadStartTime);
    const pushReturn = timeToMinutes(push.returnTime) + kitchenUnloadMinutes;
    const gapStart = Math.max(availableStart, shiftStart);
    const gapEnd = Math.min(pushDeparture, shiftEnd);
    const idleMinutes = gapEnd - gapStart;

    if (idleMinutes >= lunchMinutes && (!bestGap || idleMinutes < bestGap.idleMinutes)) {
      bestGap = { start: gapStart, end: gapEnd, idleMinutes };
    }

    if (pushReturn >= availableStart) availableStart = pushReturn;
  }

  const finalGapStart = Math.max(availableStart, shiftStart);
  const finalIdleMinutes = shiftEnd - finalGapStart;
  if (finalIdleMinutes >= lunchMinutes && (!bestGap || finalIdleMinutes < bestGap.idleMinutes)) {
    bestGap = { start: finalGapStart, end: shiftEnd, idleMinutes: finalIdleMinutes };
  }

  if (!bestGap) return null;

  const centeredStart = bestGap.start + Math.floor((bestGap.idleMinutes - lunchMinutes) / 2);
  return Math.min(centeredStart, bestGap.end - lunchMinutes);
}
