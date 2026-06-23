import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDispatchSchedule, createPlanningSchedule, rejectCriticalPairings, rejectUnassignedPushes } from "../src/engine/scheduler";
import { planningRules } from "../src/data/planningRules";
import type { Driver, FlightAssignment, Helper, PlanningRules, Truck } from "../src/types/dispatch";

const baseDrivers: Driver[] = [
  { id: "d1", name: "Driver 1", truck: "T1", radio: "R1", shiftStart: "06:00", shiftEnd: "14:30" },
  { id: "d2", name: "Driver 2", truck: "T2", radio: "R2", shiftStart: "06:00", shiftEnd: "14:30" },
];

const baseHelpers: Helper[] = [
  { id: "h1", name: "Helper 1", shiftStart: "06:00", shiftEnd: "14:30" },
  { id: "h2", name: "Helper 2", shiftStart: "06:00", shiftEnd: "14:30" },
];

const baseTrucks: Truck[] = [
  { id: "t1", truckNumber: "T1" },
  { id: "t2", truckNumber: "T2" },
];

function flight(overrides: Partial<FlightAssignment>): FlightAssignment {
  return {
    id: "f1",
    driverId: null,
    flightNumber: "UA100",
    departureDate: "2026-06-11",
    gate: "A1",
    start: "08:00",
    end: "09:00",
    etd: "10:00",
    eta: "-",
    inboundEta: "-",
    aircraft: "737",
    serviceType: "load-ua",
    originAirport: "ABC",
    destinationAirport: "DEN",
    notes: "Test flight",
    ...overrides,
  };
}

describe("scheduler", () => {
  it("builds basic pairings and resource counts for generic site codes", () => {
    const result = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", etd: "12:00", originAirport: "ABC" }),
        flight({ id: "f2", flightNumber: "UA101", etd: "12:35", gate: "A2", originAirport: "ABC" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules },
    );

    assert.equal(result.summary.totalFlights, 2);
    assert.ok(result.summary.totalPushes >= 1);
    assert.ok(result.summary.driversRequired >= 1);
  });

  it("marks unknown aircraft as critical timing risk", () => {
    const result = createPlanningSchedule(
      [flight({ aircraft: "Unknown", etd: "10:00" })],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules },
    );

    assert.equal(result.pushes[0]?.riskSeverity, "critical");
    assert.equal(result.pushes[0]?.serviceEvents[0]?.riskStatus, "unknown-aircraft");
  });

  it("reports resource shortages in dispatch mode", () => {
    const result = createDispatchSchedule(
      [flight({ aircraft: "737", etd: "10:00" })],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { availableDrivers: 0, availableHelpers: 0, availableTrucks: 0 },
      { rules: planningRules },
    );

    assert.ok(result.exceptions.some((item) => item.cause === "driver-shortage"));
    assert.ok(result.exceptions.some((item) => item.cause === "truck-shortage"));
    assert.ok(result.summary.unscheduledFlights > 0);
  });

  it("keeps widebody flights as standalone protected pushes", () => {
    const result = createPlanningSchedule(
      [
        flight({ id: "wide1", flightNumber: "UA900", aircraft: "777", etd: "12:00" }),
        flight({ id: "wide2", flightNumber: "UA901", aircraft: "787", etd: "12:20" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules },
    );

    assert.equal(result.summary.totalPushes, 2);
    assert.ok(result.pushes.every((push) => push.flights.length === 1));
  });

  it("applies site drive-time overrides", () => {
    const rules: PlanningRules = {
      ...planningRules,
      siteOverrides: {
        ...planningRules.siteOverrides,
        XYZ: { driveOutMinutes: 45, returnMinutes: 45 },
      },
    };
    const result = createPlanningSchedule(
      [flight({ originAirport: "XYZ", etd: "12:00" })],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules },
    );
    const push = result.pushes[0];

    assert.ok(push);
    assert.equal(minutesBetween(push.kitchenDepartureTime, push.arriveFirstGateTime), 45);
  });

  it("uses shared resource pool for sites configured that way", () => {
    const sharedRules: PlanningRules = {
      ...planningRules,
      siteOverrides: {
        ...planningRules.siteOverrides,
        ABC: { sharedResourcePool: true, preserveLunchWindow: false },
      },
    };
    const result = createPlanningSchedule(
      [
        flight({ id: "mainline", flightNumber: "UA200", aircraft: "737", originAirport: "ABC", etd: "12:00" }),
        flight({ id: "express", flightNumber: "UA201", aircraft: "CRJ", originAirport: "ABC", etd: "12:20" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: sharedRules },
    );

    assert.ok(result.pushes.length > 0);
    assert.ok(result.pushes.every((push) => !push.id.startsWith("M-") && !push.id.startsWith("E-")));
  });

  it("preserves lunch windows unless a site override disables that guardrail", () => {
    const constrained = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", etd: "10:00", originAirport: "ABC" }),
        flight({ id: "f2", flightNumber: "UA101", etd: "10:35", gate: "A2", originAirport: "ABC" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules },
    );
    const relaxedRules: PlanningRules = {
      ...planningRules,
      siteOverrides: {
        ...planningRules.siteOverrides,
        ABC: { preserveLunchWindow: false },
      },
    };
    const relaxed = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", etd: "10:00", originAirport: "ABC" }),
        flight({ id: "f2", flightNumber: "UA101", etd: "10:35", gate: "A2", originAirport: "ABC" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: relaxedRules },
    );

    assert.equal(constrained.summary.driversRequired, 0);
    assert.equal(constrained.summary.unscheduledFlights, 2);
    assert.ok(relaxed.summary.driversRequired > constrained.summary.driversRequired);
  });

  it("rejects critical pairings into exceptions", () => {
    const result = createPlanningSchedule(
      [flight({ aircraft: "Unknown", etd: "10:00" })],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules },
    );
    const rejected = rejectCriticalPairings(result);

    assert.equal(rejected.summary.totalPushes, 0);
    assert.equal(rejected.summary.flightsWithExceptions, 1);
    assert.ok(rejected.exceptions.some((item) => item.cause === "timing-conflict"));
  });

  it("rejects unassigned planning pushes into exceptions", () => {
    const result = createPlanningSchedule(
      [flight({ aircraft: "737", etd: "10:00" })],
      [],
      [],
      [],
      { rules: planningRules },
    );
    const rejected = rejectUnassignedPushes(result);

    assert.equal(rejected.summary.totalPushes, 0);
    assert.equal(rejected.summary.unscheduledFlights, 0);
    assert.equal(rejected.summary.flightsWithExceptions, 1);
    assert.ok(rejected.exceptions.some((item) => item.cause === "driver-shortage"));
    assert.ok(rejected.exceptions.some((item) => item.issue === "Missing driver, truck and helper coverage for UA100"));
    assert.ok(rejected.exceptions.every((item) => !item.issue.includes("M-P")));
  });
});

function minutesBetween(start: string, end: string) {
  return timeValue(end) - timeValue(start);
}

function timeValue(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
