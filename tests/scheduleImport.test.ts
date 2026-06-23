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

  it("recognizes TripMaster exports and reports available departure dates", () => {
    const result = parseScheduleRows([
      ["Departure", "Airln", "Board", "Serv", "Depart ", "Ramp", "Kitchen", "Freq", "AC", "From", "To"],
      [" 06/01/2026", "UA", "3750 ", "3750 ", "00:26", "21:26", "18:26", "1 ", "37X", "ORD", "EWR"],
      [" 06/02/2026", "UA", "2666 ", "2666 ", "05:00", "02:00", "23:00", "1 ", "21N", "ORD", "DEN"],
    ]);

    assert.equal(result.detectedFormat, "standard");
    assert.deepEqual(result.availableDates, ["2026-06-01", "2026-06-02"]);
    assert.equal(result.normalizedRows.length, 2);
    assert.equal(result.normalizedRows[0]?.airline, "UA");
    assert.equal(result.normalizedRows[0]?.flightNumber, "3750");
    assert.equal(result.normalizedRows[0]?.departureTime, "00:26");
    assert.equal(result.normalizedRows[0]?.aircraftType, "37X");
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
