import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planningRules } from "../src/data/planningRules";
import type { FlightAssignment } from "../src/types/dispatch";
import { earliestPlanningShiftStartMinutes } from "../src/utils/shiftStarts";

function flight(etd: string): FlightAssignment {
  return {
    id: "shift-start-test",
    driverId: null,
    flightNumber: "UA100",
    departureDate: "2026-06-11",
    gate: "A1",
    start: "06:00",
    end: "07:00",
    etd,
    eta: "-",
    inboundEta: "-",
    aircraft: "737",
    serviceType: "load-ua",
    originAirport: "ORD",
    destinationAirport: "DEN",
    notes: "Test flight",
  };
}

describe("planning shift starts", () => {
  it("starts early enough to cover load preparation before dock departure", () => {
    const earliestStart = earliestPlanningShiftStartMinutes([flight("06:30")], planningRules, 15);

    assert.equal(earliestStart, 3 * 60 + 15);
  });

  it("snaps the first start down to the configured increment", () => {
    const earliestStart = earliestPlanningShiftStartMinutes([flight("06:40")], planningRules, 30);

    assert.equal(earliestStart, 3 * 60);
  });
});
