import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseScheduleRows } from "../src/import/scheduleImport";

describe("schedule import normalization", () => {
  it("normalizes standard airline schedule rows into dispatch-ready flights", () => {
    const result = parseScheduleRows([
      ["Departure Date", "Airline", "Flight Number", "Unused", "Field Departure Time", "Unused", "Unused", "Unused", "Aircraft Type", "Origin", "Destination"],
      ["6/11/2026", "UA", "0100", "", "9:30", "", "", "", "737", "pdx", "den"],
    ]);

    assert.equal(result.detectedFormat, "standard");
    assert.equal(result.normalizedRows.length, 1);
    assert.deepEqual(result.normalizedRows[0], {
      sourceRowNumber: 2,
      departureDate: "2026-06-11",
      airline: "UA",
      flightNumber: "100",
      departureTime: "09:30",
      aircraftType: "737",
      originSite: "PDX",
      destination: "DEN",
    });
    assert.equal(result.flights[0]?.flightNumber, "UA100");
    assert.equal(result.flights[0]?.originAirport, "PDX");
    assert.equal(result.flights[0]?.etd, "09:30");
  });

  it("normalizes combined flight schedule rows into the same internal output", () => {
    const result = parseScheduleRows([
      ["Date", "Flight", "Field", "Unused", "Kitchen", "Aircraft", "From", "To"],
      ["2026-06-11", "UA100", "0930", "", "07:30", "B 737", "PDX", "DEN"],
    ]);

    assert.equal(result.detectedFormat, "combined-flight");
    assert.equal(result.normalizedRows.length, 1);
    assert.equal(result.normalizedRows[0]?.flightNumber, "100");
    assert.equal(result.normalizedRows[0]?.departureTime, "09:30");
    assert.equal(result.normalizedRows[0]?.originSite, "PDX");
    assert.equal(result.flights[0]?.flightNumber, "UA100");
    assert.equal(result.flights[0]?.aircraft, "B 737");
  });

  it("skips bad rows without rejecting the whole schedule when valid rows remain", () => {
    const result = parseScheduleRows([
      ["Departure Date", "Airline", "Flight Number", "Field Departure Time", "Aircraft Type", "Origin", "Destination"],
      ["2026-06-11", "UA", "100", "09:30", "737", "PDX", "DEN"],
      ["2026-06-11", "UA", "100", "09:30", "737", "PDX", "DEN"],
      ["2026-06-11", "UA", "101", "99:99", "737", "PDX", "SFO"],
      ["2026-06-11", "UA", "102", "10:30", "ZZZ", "PDX", "LAX"],
      ["", "UA", "103", "10:45", "737", "PDX", "SEA"],
    ]);

    assert.equal(result.normalizedRows.length, 1);
    assert.equal(result.skippedRowCount, 4);
    assert.ok(result.warnings.some((warning) => warning.includes("duplicate flight")));
    assert.ok(result.warnings.some((warning) => warning.includes("invalid departure time")));
    assert.ok(result.warnings.some((warning) => warning.includes("unsupported aircraft type")));
    assert.ok(result.warnings.some((warning) => warning.includes("missing or invalid departure date")));
  });

  it("fails clearly for unknown layouts", () => {
    assert.throws(
      () => parseScheduleRows([["Something", "Else"], ["UA100", "PDX"]]),
      /Unknown schedule format/,
    );
  });
});
