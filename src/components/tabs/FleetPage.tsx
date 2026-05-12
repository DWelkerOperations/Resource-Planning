import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Truck, Wrench } from "lucide-react";
import { fleetVehicleSizes, fleetVehicleStatuses, fleetVehicleTypes, mockFleet } from "../../data/mockFleet";
import type { FleetVehicle, FleetVehicleStatus, FleetVehicleType } from "../../types/dispatch";
import { KpiCard } from "../ui/KpiCard";
import { Panel } from "../ui/Panel";

type FleetFilter = "All";

export function FleetPage() {
  const [fleet, setFleet] = useState<FleetVehicle[]>(mockFleet);
  const [typeFilter, setTypeFilter] = useState<FleetVehicleType | FleetFilter>("All");
  const [statusFilter, setStatusFilter] = useState<FleetVehicleStatus | FleetFilter>("All");
  const [sizeFilter, setSizeFilter] = useState<FleetVehicle["size"] | FleetFilter>("All");

  const filteredFleet = useMemo(() => fleet.filter((vehicle) => {
    const typeMatches = typeFilter === "All" || vehicle.type === typeFilter;
    const statusMatches = statusFilter === "All" || vehicle.status === statusFilter;
    const sizeMatches = sizeFilter === "All" || vehicle.size === sizeFilter;
    return typeMatches && statusMatches && sizeMatches;
  }), [fleet, sizeFilter, statusFilter, typeFilter]);

  const availableCount = fleet.filter((vehicle) => vehicle.status === "Available").length;
  const downCount = fleet.filter((vehicle) => vehicle.status === "Down / Unavailable" || vehicle.status === "Maintenance").length;
  const activeCount = fleet.filter((vehicle) => vehicle.status === "Assigned" || vehicle.status === "Out on Push").length;

  function updateStatus(vehicleId: string, status: FleetVehicleStatus) {
    setFleet((currentFleet) =>
      currentFleet.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, status } : vehicle),
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Fleet</h2>
        <p className="mt-1 text-sm text-slate-500">Mock vehicle master list for catering trucks and support vehicles.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Fleet" value={String(fleet.length)} helper="Mock vehicle records" icon={<Truck size={20} />} />
        <KpiCard label="Available Trucks" value={String(availableCount)} helper="Ready for assignment" icon={<CheckCircle2 size={20} />} />
        <KpiCard label="Assigned / Out" value={String(activeCount)} helper="Assigned or on push" icon={<AlertTriangle size={20} />} />
        <KpiCard label="Down / Maintenance" value={String(downCount)} helper="Not dispatchable" icon={<Wrench size={20} />} />
      </div>

      <Panel className="p-4">
        <div className="grid grid-cols-3 gap-4">
          <FilterSelect label="Truck Type" value={typeFilter} options={["All", ...fleetVehicleTypes]} onChange={(value) => setTypeFilter(value as FleetVehicleType | FleetFilter)} />
          <FilterSelect label="Status" value={statusFilter} options={["All", ...fleetVehicleStatuses]} onChange={(value) => setStatusFilter(value as FleetVehicleStatus | FleetFilter)} />
          <FilterSelect label="Size" value={sizeFilter} options={["All", ...fleetVehicleSizes]} onChange={(value) => setSizeFilter(value as FleetVehicle["size"] | FleetFilter)} />
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Truck</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Make / Model</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">Push</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredFleet.map((vehicle) => (
              <tr key={vehicle.id} className="bg-white">
                <td className="px-4 py-3"><div className="font-semibold text-ink">{vehicle.truckNumber}</div><div className="text-xs text-slate-500">{vehicle.id}</div></td>
                <td className="px-4 py-3 text-slate-700">{vehicle.type}</td>
                <td className="px-4 py-3 text-slate-700">{vehicle.size}</td>
                <td className="px-4 py-3 text-slate-700">{vehicle.make} {vehicle.model}</td>
                <td className="px-4 py-3 text-slate-700">{vehicle.capacity}</td>
                <td className="px-4 py-3"><StatusSelect value={vehicle.status} onChange={(status) => updateStatus(vehicle.id, status)} /></td>
                <td className="px-4 py-3 text-slate-700">{vehicle.assignedDriver ?? "-"}</td>
                <td className="px-4 py-3 text-slate-700">{vehicle.assignedPush ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{vehicle.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function StatusSelect({ value, onChange }: { value: FleetVehicleStatus; onChange: (value: FleetVehicleStatus) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as FleetVehicleStatus)} className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
      {fleetVehicleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );
}
