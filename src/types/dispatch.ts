export type AppTab =
  | "planning"
  | "resource-guide"
  | "dispatch"
  | "staffing"
  | "fleet"
  | "exceptions"
  | "tour-sheet"
  | "dashboard"
  | "thumb-rules";

export type OperationType = "mainline" | "express";
export type OperationView = OperationType | "all";

export type AircraftCategory = "regional" | "narrowbody" | "widebody" | "unknown";

export type AirportCode = string;

export type RiskSeverity = "normal" | "watch" | "urgent" | "critical";

export type ServiceRiskStatus = "normal" | "watch" | "urgent-risk" | "late-risk" | "unknown-aircraft";

export type ServiceType =
  | "load-ua"
  | "load-other"
  | "positioning"
  | "other-work"
  | "intl-strip"
  | "break"
  | "unplanned";

export type Driver = {
  id: string;
  name: string;
  truck: string;
  radio: string;
  shiftStart: string;
  shiftEnd: string;
  displayShiftStart?: string;
  displayShiftEnd?: string;
};

export type FlightAssignment = {
  id: string;
  driverId: string | null;
  flightNumber: string;
  departureDate?: string;
  gate: string;
  start: string;
  end: string;
  etd: string;
  eta: string;
  inboundEta: string;
  aircraft: string;
  serviceType: ServiceType;
  originAirport?: AirportCode;
  destinationAirport?: string;
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
  aircraftCategory: AircraftCategory;
  operationType: OperationType;
  originAirport?: AirportCode;
  destinationAirport?: string;
  loadWindowStart: string;
  loadWindowEnd: string;
  hardLatestCompletion: string;
  workloadUnits: number;
};

export type Helper = {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
  displayShiftStart?: string;
  displayShiftEnd?: string;
};

export type Truck = {
  id: string;
  truckNumber: string;
  vehicleType?: FleetVehicleType;
};

export type ScheduleException = {
  id: string;
  flightId?: string;
  flightNumber?: string;
  operationType?: OperationType;
  serviceType?: ServiceType;
  pushId?: string;
  issue: string;
  cause: "driver-shortage" | "helper-shortage" | "truck-shortage" | "timing-conflict" | "food-safety-window" | "delayed-flight-risk";
  recommendedAction: string;
};

export type ServiceEvent = {
  flightId: string;
  flightNumber: string;
  gate: string;
  aircraftType: string;
  destinationAirport?: string;
  departureTime: string;
  serviceStart: string;
  serviceEnd: string;
  serviceDurationMinutes: number;
  riskStatus: ServiceRiskStatus;
  riskSeverity: RiskSeverity;
};

export type Push = {
  id: string;
  driverId: string | null;
  helperId: string | null;
  truckId: string | null;
  flights: Flight[];
  aircraftCategory: AircraftCategory;
  loadStartTime: string;
  loadEndTime: string;
  loadDurationMinutes: number;
  kitchenDepartureTime: string;
  gateServiceTime: string;
  arriveFirstGateTime: string;
  serviceEvents: ServiceEvent[];
  returnTime: string;
  totalDurationMinutes: number;
  utilizationMinutes: number;
  idleMinutes: number;
  isFeasible: boolean;
  riskFlags: string[];
  riskSeverity: RiskSeverity;
  pairingScore: number;
  explanation: string;
  exceptionFlags: string[];
};

export type ResourceInputs = {
  availableDrivers: number;
  availableHelpers: number;
  availableTrucks: number;
};

export type ScheduleSummary = {
  totalFlights: number;
  totalStripTasks: number;
  totalPushes: number;
  driversRequired: number;
  helpersRequired: number;
  maxTrucksRequired: number;
  flightsScheduledNormally: number;
  flightsWithExceptions: number;
  unscheduledFlights: number;
  shiftUtilizationPercent: number;
  watchPushes: number;
  urgentPushes: number;
  criticalPushes: number;
};

export type ScheduleResult = {
  mode: "planning" | "dispatch";
  pushes: Push[];
  exceptions: ScheduleException[];
  summary: ScheduleSummary;
  resourceBottlenecks: string[];
  rules: PlanningRules;
};

export type PairingStrategy = {
  targetThreeFlightPairingPercent: number;
  allowUrgentPairings?: boolean;
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
  location: AirportCode;
  operationType: OperationType;
  shift: Shift;
  status: StaffStatus;
  assignedPush: string | null;
  notes: string;
};

export type PlanningRules = {
  blockMinutes: number;
  targetCompletionBeforeDepartureMinutes: number;
  hardMinimumCompletionBeforeDepartureMinutes: number;
  earliestCateringBeforeDepartureMinutes: number;
  maxKitchenDepartureBeforeDepartureMinutes: number;
  mainlineDriveOutMinutes: number;
  expressDriveOutMinutes: number;
  mainlineReturnMinutes: number;
  expressReturnMinutes: number;
  firstAircraftSetupMinutes: number;
  gateToGateMoveMinutes: number;
  maxFlightsPerPush: number;
  groupWindowMinutes: number;
  maxWorkloadUnitsPerPush: number;
  standardShiftHours: number;
  lunchMinutes: number;
  idealLunchBeforeHour: number;
  serviceMinutesByAircraftCategory: Record<AircraftCategory, number>;
  helperRequiredForMainline: boolean;
  priorityOrder: string[];
  siteOverrides?: Record<string, SitePlanningRules>;
};

export type SitePlanningRules = {
  driveOutMinutes?: number;
  returnMinutes?: number;
  sealBreakMinutes?: number;
  gateToGateMoveMinutes?: number;
  sharedResourcePool?: boolean;
  allowShiftStretch?: boolean;
  preserveLunchWindow?: boolean;
  preferredReuseWindowMinutes?: number;
  lateWavePenaltyPerMinute?: number;
  maxFlightsPerPush?: number;
  groupWindowMinutes?: number;
  maxWorkloadUnitsPerPush?: number;
  maxDockDepartureToFinalServiceEndMinutes?: number;
  separateUnitedAndOtherAirlines?: boolean;
};

export type FleetVehicleType = "10 Ft. SOV" | "14 Ft. SOV XL" | "16 Ft. Truck" | "22 Ft. Truck" | "Spare Truck";

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
  location: AirportCode;
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
