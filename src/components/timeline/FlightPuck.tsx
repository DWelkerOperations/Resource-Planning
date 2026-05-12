import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import type { Driver, FlightAssignment } from "../../types/dispatch";
import { durationMinutes, minutesFromStart, pixelsPerMinute, serviceStyle } from "./timelineUtils";
import { FlightHoverCard } from "./FlightHoverCard";

type FlightPuckProps = {
  flight: FlightAssignment;
  driver?: Driver;
};

export function FlightPuck({ flight, driver }: FlightPuckProps) {
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
      className={`group absolute top-2 flex h-7 cursor-grab items-center justify-between gap-1 rounded-lg border px-2 text-[12px] font-medium shadow-sm transition active:cursor-grabbing hover:z-30 hover:-translate-y-0.5 hover:shadow-md ${serviceStyle(flight.serviceType)} ${flight.edited ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${flight.overtime ? "outline outline-2 outline-red-300" : ""} ${isLunch ? "justify-center rounded-full border-red-400 bg-white text-red-600" : ""} ${isDragging ? "z-50 opacity-75 shadow-lg" : ""}`}
      style={{
        left: minutesFromStart(flight.start) * pixelsPerMinute,
        width: isLunch ? 34 : durationMinutes(flight.start, flight.end) * pixelsPerMinute,
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
