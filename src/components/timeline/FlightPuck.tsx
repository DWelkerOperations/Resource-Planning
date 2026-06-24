import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import type { Driver, FlightAssignment } from "../../types/dispatch";
import { useTimelineScale } from "./TimelineScaleContext";
import { durationMinutes, minutesFromStart, pixelsPerMinute, serviceStyle } from "./timelineUtils";
import { FlightHoverCard } from "./FlightHoverCard";

type FlightPuckProps = {
  flight: FlightAssignment;
  driver?: Driver;
};

export function FlightPuck({ flight, driver }: FlightPuckProps) {
  const scale = useTimelineScale();
  const minuteWidth = pixelsPerMinute * scale;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: flight.id,
    data: { flightId: flight.id },
  });

  const isLunch = flight.serviceType === "break";

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group absolute top-1.5 flex h-6 cursor-grab items-center justify-between gap-1 rounded-lg border px-2 text-[11px] font-medium shadow-sm transition active:cursor-grabbing hover:z-30 hover:-translate-y-0.5 hover:shadow-md ${serviceStyle(flight.serviceType)} ${flight.edited ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${flight.overtime ? "outline outline-2 outline-red-300" : ""} ${isLunch ? "justify-center rounded-full border-slate-300 bg-white text-slate-600" : ""} ${isDragging ? "z-50 opacity-75 shadow-lg" : ""}`}
      style={{
        left: minutesFromStart(flight.start) * minuteWidth,
        width: isLunch ? 34 : durationMinutes(flight.start, flight.end) * minuteWidth,
        transform: CSS.Translate.toString(transform),
      }}
      title={flight.flightNumber}
    >
      {!isLunch && <GripVertical size={12} className="shrink-0 opacity-45" />}
      <span className="truncate">{isLunch ? "L" : `${flight.flightNumber} ${flight.gate}`}</span>
      {!isLunch && <ChevronRight size={14} className="shrink-0 opacity-75" />}
      <FlightHoverCard flight={flight} driver={driver} />
    </button>
  );
}
