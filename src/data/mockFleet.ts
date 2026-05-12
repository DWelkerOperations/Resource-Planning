import type { FleetVehicle, FleetVehicleStatus, FleetVehicleType } from "../types/dispatch";

const truckTypes: FleetVehicleType[] = ["Refrigerated Truck", "High-Lift Truck", "Box Truck", "Cargo Van", "Spare Truck"];
const sizes: FleetVehicle["size"][] = ["Large", "Large", "Medium", "Small", "Medium"];
const makes = ["Freightliner", "Isuzu", "Ford", "International", "Hino"];
const models = ["M2", "NPR", "Transit", "MV", "268"];
const capacities = ["18 carts", "22 carts", "14 carts", "8 carts", "16 carts"];

const statusCycle: FleetVehicleStatus[] = [
  "Available",
  "Available",
  "Available",
  "Assigned",
  "Out on Push",
  "Returning",
  "Down / Unavailable",
  "Maintenance",
];

export const fleetVehicleStatuses: FleetVehicleStatus[] = [
  "Available",
  "Assigned",
  "Out on Push",
  "Returning",
  "Down / Unavailable",
  "Maintenance",
];

export const fleetVehicleTypes = truckTypes;
export const fleetVehicleSizes: FleetVehicle["size"][] = ["Small", "Medium", "Large"];

export const mockFleet: FleetVehicle[] = Array.from({ length: 110 }, (_, index) => {
  const typeIndex = index % truckTypes.length;
  const status = statusCycle[index % statusCycle.length];

  return {
    id: `TRK-${String(index + 1).padStart(4, "0")}`,
    truckNumber: String(4100 + index).padStart(4, "0"),
    type: truckTypes[typeIndex],
    size: sizes[typeIndex],
    make: makes[typeIndex],
    model: models[typeIndex],
    capacity: capacities[typeIndex],
    status,
    assignedDriver: status === "Assigned" || status === "Out on Push" || status === "Returning" ? `EMP-${String((index % 150) + 1).padStart(4, "0")}` : null,
    assignedPush: status === "Assigned" || status === "Out on Push" || status === "Returning" ? `P-${String((index % 45) + 1).padStart(3, "0")}` : null,
    notes: "Mock fleet master record",
  };
});
