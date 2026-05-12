export type AppTab =
  | "planning"
  | "dispatch"
  | "timeline"
  | "staffing"
  | "fleet"
  | "exceptions"
  | "tour-sheet"
  | "dashboard"
  | "thumb-rules";

export type ServiceType =
  | "load-ua"
  | "load-other"
  | "positioning"
  | "other-work"
  | "break"
  | "unplanned";

export type Driver = {
  id: string;
  name: string;
  truck: string;
  radio: string;
  shiftStart: string;
  shiftEnd: string;
};

export type FlightAssignment = {
  id: string;
  driverId: string | null;
  flightNumber: string;
  gate: string;
  start: string;
  end: string;
  etd: string;
  eta: string;
  inboundEta: string;
  aircraft: string;
  serviceType: ServiceType;
  notes: string;
  edited?: boolean;
  overtime?: boolean;
};

export type ExceptionItem = {
  id: string;
  type: string;
  severity: "High" | "Medium" | "Low";
  owner: string;
  detail: string;
  time: string;
};

export type RuleItem = {
  id: string;
  category: string;
  setting: string;
  value: string;
};

export type Flight = {
  id: string;
  flightNumber: string;
  gate: string;
  etd: string;
  eta: string;
  inboundEta: string;
  aircraft: string;
  serviceType: ServiceType;
  loadWindowStart: string;
  loadWindowEnd: string;
  workloadUnits: number;
};

export type Helper = {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
};

export type Truck = {
  id: string;
  truckNumber: string;
};

export type ScheduleException = {
  id: string;
  flightId?: string;
  flightNumber?: string;
  pushId?: string;
  issue: string;
  cause: "driver-shortage" | "helper-shortage" | "truck-shortage" | "timing-conflict" | "food-safety-window";
  recommendedAction: string;
};

export type Push = {
  id: string;
  driverId: string | null;
  helperId: string | null;
  truckId: string | null;
  flights: Flight[];
  kitchenDepartureTime: string;
  gateServiceTime: string;
  returnTime: string;
  totalDurationMinutes: number;
  exceptionFlags: string[];
};

export type ResourceInputs = {
  availableDrivers: number;
  availableHelpers: number;
  availableTrucks: number;
};

export type ScheduleSummary = {
  totalFlights: number;
  totalPushes: number;
  driversRequired: number;
  helpersRequired: number;
  maxTrucksRequired: number;
  flightsScheduledNormally: number;
  flightsWithExceptions: number;
  unscheduledFlights: number;
};

export type ScheduleResult = {
  mode: "planning" | "dispatch";
  pushes: Push[];
  exceptions: ScheduleException[];
  summary: ScheduleSummary;
  resourceBottlenecks: string[];
};

export type StaffRole = "Driver" | "Helper";

export type StaffStatus =
  | "Available"
  | "Assigned"
  | "On Push"
  | "Lunch"
  | "Off Shift"
  | "Call Out"
  | "Unavailable";

export type Shift = {
  start: string;
  end: string;
  lengthHours: number;
};

export type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  shift: Shift;
  status: StaffStatus;
  assignedPush: string | null;
  notes: string;
};

export type FleetVehicleType = "Box Truck" | "Refrigerated Truck" | "High-Lift Truck" | "Cargo Van" | "Spare Truck";

export type FleetVehicleStatus =
  | "Available"
  | "Assigned"
  | "Out on Push"
  | "Returning"
  | "Down / Unavailable"
  | "Maintenance";

export type FleetVehicle = {
  id: string;
  truckNumber: string;
  type: FleetVehicleType;
  size: "Small" | "Medium" | "Large";
  make: string;
  model: string;
  capacity: string;
  status: FleetVehicleStatus;
  assignedDriver: string | null;
  assignedPush: string | null;
  notes: string;
};
