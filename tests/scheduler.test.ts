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

  it("defaults planning to legal 3-flight pairings before adding drivers", () => {
    const drivers: Driver[] = [
      ...baseDrivers,
      { id: "d3", name: "Driver 3", truck: "T3", radio: "R3", shiftStart: "06:00", shiftEnd: "14:30" },
      { id: "d4", name: "Driver 4", truck: "T4", radio: "R4", shiftStart: "06:00", shiftEnd: "14:30" },
    ];
    const helpers: Helper[] = [
      ...baseHelpers,
      { id: "h3", name: "Helper 3", shiftStart: "06:00", shiftEnd: "14:30" },
      { id: "h4", name: "Helper 4", shiftStart: "06:00", shiftEnd: "14:30" },
    ];
    const trucks: Truck[] = [
      ...baseTrucks,
      { id: "t3", truckNumber: "T3" },
      { id: "t4", truckNumber: "T4" },
    ];

    const result = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", etd: "12:00", gate: "A1", originAirport: "ABC" }),
        flight({ id: "f2", flightNumber: "UA101", etd: "12:15", gate: "A2", originAirport: "ABC" }),
        flight({ id: "f3", flightNumber: "UA102", etd: "12:30", gate: "A3", originAirport: "ABC" }),
        flight({ id: "f4", flightNumber: "UA103", etd: "13:30", gate: "A4", originAirport: "ABC" }),
        flight({ id: "f5", flightNumber: "UA104", etd: "13:45", gate: "A5", originAirport: "ABC" }),
        flight({ id: "f6", flightNumber: "UA105", etd: "14:00", gate: "A6", originAirport: "ABC" }),
      ],
      drivers,
      helpers,
      trucks,
      { rules: { ...planningRules, siteOverrides: { ABC: { preserveLunchWindow: false } } } },
    );

    assert.equal(result.summary.totalPushes, 2);
    assert.equal(result.summary.driversRequired, 2);
    assert.deepEqual(result.pushes.map((push) => push.flights.length), [3, 3]);
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

  it("uses ORD 30 minute drive, 30 minute return, and 10 minutes between catered flights", () => {
    const rules: PlanningRules = {
      ...planningRules,
      siteOverrides: {
        ...planningRules.siteOverrides,
        ORD: { ...planningRules.siteOverrides?.ORD, preserveLunchWindow: false },
      },
    };
    const result = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", aircraft: "737", etd: "12:00", originAirport: "ORD" }),
        flight({ id: "f2", flightNumber: "UA101", aircraft: "737", etd: "12:35", gate: "B2", originAirport: "ORD" }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules, operationType: "mainline" },
    );
    const push = result.pushes[0];

    assert.ok(push);
    assert.equal(minutesBetween(push.kitchenDepartureTime, push.arriveFirstGateTime), 30);
    assert.equal(minutesBetween(push.serviceEvents[0].serviceEnd, push.serviceEvents[1].serviceStart), 10);
    assert.equal(minutesBetween(push.serviceEvents[1].serviceEnd, push.returnTime), 30);
  });

  it("plans international strip service from aircraft arrival with customs wait", () => {
    const result = createPlanningSchedule(
      [
        flight({
          id: "strip1",
          flightNumber: "UA9063",
          aircraft: "37K",
          etd: "23:14",
          inboundEta: "22:07",
          originAirport: "ORD",
          destinationAirport: "ORD",
          serviceType: "intl-strip",
        }),
      ],
      baseDrivers,
      baseHelpers,
      baseTrucks,
      { rules: planningRules, operationType: "mainline" },
    );
    const push = result.pushes[0];
    const event = push?.serviceEvents[0];

    assert.ok(push);
    assert.ok(event);
    assert.equal(push.kitchenDepartureTime, "21:22");
    assert.equal(push.arriveFirstGateTime, "21:52");
    assert.equal(event.serviceStart, "22:22");
    assert.equal(minutesBetween(push.arriveFirstGateTime, "22:07"), 15);
    assert.equal(minutesBetween("22:07", event.serviceStart), 15);
  });

  it("limits push duration by final catering end before return drive for all kitchens", () => {
    const rules: PlanningRules = {
      ...planningRules,
      siteOverrides: {
        ...planningRules.siteOverrides,
        ABC: { preserveLunchWindow: false },
      },
    };
    const result = createPlanningSchedule(
      [
        flight({ id: "f1", flightNumber: "UA100", aircraft: "757", etd: "12:00", originAirport: "ABC" }),
        flight({ id: "f2", flightNumber: "UA101", aircraft: "757", etd: "12:50", gate: "B2", originAirport: "ABC" }),
        flight({ id: "f3", flightNumber: "UA102", aircraft: "757", etd: "13:40", gate: "B3", originAirport: "ABC" }),
      ],
      [
        ...baseDrivers,
        { id: "d3", name: "Driver 3", truck: "T3", radio: "R3", shiftStart: "06:00", shiftEnd: "14:30" },
      ],
      [
        ...baseHelpers,
        { id: "h3", name: "Helper 3", shiftStart: "06:00", shiftEnd: "14:30" },
      ],
      [
        ...baseTrucks,
        { id: "t3", truckNumber: "T3" },
      ],
      { rules, operationType: "mainline" },
    );

    assert.ok(result.pushes.length > 1);
    assert.ok(result.pushes.every((push) => push.flights.length < 3));
    assert.ok(result.pushes.every((push) => {
      const finalServiceEnd = push.serviceEvents[push.serviceEvents.length - 1]?.serviceEnd;
      return finalServiceEnd ? minutesBetween(push.kitchenDepartureTime, finalServiceEnd) <= 135 : true;
    }));
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
