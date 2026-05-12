import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { mockDrivers } from "../../data/mockDrivers";
import { mockFlights } from "../../data/mockFlights";
import type { FlightAssignment } from "../../types/dispatch";
import { Panel } from "../ui/Panel";
import { DriverColumn } from "./DriverColumn";
import { OpenFlightsLane } from "./OpenFlightsLane";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineLegend } from "./TimelineLegend";
import { timelineWidth } from "./timelineUtils";

export function DispatcherTimeline({ flights: sourceFlights = mockFlights }: { flights?: FlightAssignment[] }) {
  const [flights, setFlights] = useState<FlightAssignment[]>(sourceFlights);

  useEffect(() => {
    setFlights(sourceFlights);
  }, [sourceFlights]);

  function handleDragEnd(event: DragEndEvent) {
    const flightId = String(event.active.id);
    const newDriverId = event.over?.id ? String(event.over.id) : null;
    if (!newDriverId) return;
    setFlights((currentFlights) => currentFlights.map((flight) => flight.id === flightId ? { ...flight, driverId: newDriverId, edited: true } : flight));
  }

  const assignedFlights = flights.filter((flight) => flight.driverId);
  const openFlights = flights.filter((flight) => !flight.driverId);

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Dispatcher Timeline</h2>
            <p className="mt-0.5 text-xs text-slate-500">Driver pairing view · {assignedFlights.length} assigned work blocks · {openFlights.length} open items</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">On-shift visible</span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">OT watch visible</span>
          </div>
        </div>
        <div className="overflow-auto">
          <div style={{ minWidth: 380 + timelineWidth() }}>
            <TimelineHeader />
            <div className="flex"><DriverColumn drivers={mockDrivers} /><TimelineGrid drivers={mockDrivers} flights={assignedFlights} /></div>
            <OpenFlightsLane flights={openFlights} />
            <TimelineLegend />
          </div>
        </div>
      </Panel>
    </DndContext>
  );
}
