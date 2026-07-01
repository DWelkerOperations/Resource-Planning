import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maxScheduleFileBytes, maxScheduleRows, parseScheduleRows, validateScheduleFileMetadata } from "../src/import/scheduleImport";

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
    assert.equal(result.flights.filter((flight) => flight.originAirport === "ORD" && flight.departureDate === "2026-06-02").length, 1);
  });

  it("normalizes UA turns reports using outbound turns and planned inbound arrival", () => {
    const result = parseScheduleRows([
      ["", "", "", "", "", "TURNS REPORT", "", "", "", "", "", ""],
      ["Inbound Flight Information", "", "", "", "GROUND", "", "", "", "Outbound Flight Info", "", "", ""],
      ["Arrv Date", "FLIGHT", "FROM", "ARRIVES", "TIME", "TERM", "A/C", "STATION", "FLIGHT", "TO", "DEPARTS", ""],
      ["1-Jun-26", "2465", "BNA", "9:38", "0:57", "", "73G", "ORD", "365", "CVG", "10:35", ""],
      ["1-Jun-26", "546", "EWR", "22:07", "1:07", "Strip", "37K", "ORD", "9063", "ORD", "23:14", ""],
    ]);

    assert.equal(result.detectedFormat, "ua-turns");
    assert.deepEqual(result.availableDates, ["2026-06-01"]);
    assert.equal(result.normalizedRows.length, 2);
    assert.equal(result.normalizedRows[0]?.flightNumber, "365");
    assert.equal(result.normalizedRows[0]?.departureTime, "10:35");
    assert.equal(result.normalizedRows[0]?.inboundArrivalTime, "09:38");
    assert.equal(result.flights[0]?.flightNumber, "UA365");
    assert.equal(result.flights[0]?.originAirport, "ORD");
    assert.equal(result.flights[0]?.destinationAirport, "CVG");
    assert.equal(result.flights[0]?.inboundEta, "09:38");
    assert.equal(result.flights[0]?.serviceType, "load-ua");
    assert.equal(result.flights[1]?.serviceType, "intl-strip");
    assert.match(result.flights[1]?.notes ?? "", /Strip: Strip/);
  });

  it("treats first Depart as date and second Depart as time in flight overview exports", () => {
    const result = parseScheduleRows([
      ["Depart", "Flight", "Depart", "Ramp", "Kitchen", "Aircraft ", "From ", "To", "Hen "],
      [" 06/22/2026", "DL 2950", "05:40", "02:40", "23:40", "DL 321", "BWI", "ATL", "N"],
      [" 06/22/2026", "DL 2601", "06:08", "03:08", "00:08", "DL 717", "BWI", "DTW", "N"],
      [" 06/22/2026", "DL 2357", "11:35", "08:35", "05:35", "DL 221", "BWI", "MSP", "N"],
      [" 06/22/2026", "DL 2961", "21:15", "18:15", "15:15", "DL 223", "BWI", "ATL", "N"],
      [" 06/22/2026", "AA 2670", "06:15", "03:15", "00:15", "AA 32K", "BWI", "CLT", "TRASH"],
      [" 06/22/2026", "5Y 8875", "09:33", "06:33", "03:33", "5Y 747", "BWI", "CVG", "DLV"],
      ["6/23/26", "14:00: ", "", "", "", "", "", "", ""],
    ]);

    assert.equal(result.detectedFormat, "flight-overview");
    assert.equal(result.skippedRowCount, 0);
    assert.equal(result.normalizedRows.length, 6);
    assert.deepEqual(result.availableDates, ["2026-06-22"]);
    assert.equal(result.normalizedRows[0]?.departureDate, "2026-06-22");
    assert.equal(result.normalizedRows[0]?.departureTime, "05:40");
    assert.equal(result.normalizedRows[0]?.aircraftType, "321");
    assert.equal(result.normalizedRows[1]?.aircraftType, "717");
    assert.equal(result.normalizedRows[2]?.aircraftType, "221");
    assert.equal(result.normalizedRows[3]?.aircraftType, "223");
    assert.equal(result.normalizedRows[4]?.aircraftType, "32K");
    assert.equal(result.normalizedRows[5]?.airline, "5Y");
    assert.equal(result.normalizedRows[5]?.aircraftType, "747");
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

  it("rejects unsupported schedule file metadata before parsing", () => {
    assert.throws(
      () => validateScheduleFileMetadata({ name: "schedule.csv", size: 100, type: "text/csv" }),
      /ending in \.xlsx or \.xls/,
    );
    assert.throws(
      () => validateScheduleFileMetadata({ name: "schedule.xlsx", size: 0, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      /empty/,
    );
    assert.throws(
      () => validateScheduleFileMetadata({ name: "schedule.xlsx", size: maxScheduleFileBytes + 1, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      /too large/,
    );
    assert.throws(
      () => validateScheduleFileMetadata({ name: "schedule.xlsx", size: 100, type: "text/plain" }),
      /not recognized as an Excel workbook/,
    );
  });

  it("allows common Excel file metadata", () => {
    assert.doesNotThrow(() => validateScheduleFileMetadata({ name: "schedule.xlsx", size: 100, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    assert.doesNotThrow(() => validateScheduleFileMetadata({ name: "schedule.xls", size: 100, type: "application/vnd.ms-excel" }));
    assert.doesNotThrow(() => validateScheduleFileMetadata({ name: "schedule.xls", size: 100, type: "" }));
    assert.doesNotThrow(() => validateScheduleFileMetadata({ name: "large-tripmaster.xlsx", size: 32 * 1024 * 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  });

  it("allows large monthly turns workbooks", () => {
    const rows: unknown[][] = Array.from({ length: 86501 }, () => []);
    rows[0] = ["Date", "Airline", "Flight Number", "Departure Time", "Aircraft", "Origin Site", "Destination"];
    rows[1] = ["2026-06-01", "UA", "100", "08:00", "737", "ORD", "DEN"];

    const result = parseScheduleRows(rows);

    assert.equal(result.normalizedRows.length, 1);
    assert.equal(result.skippedRowCount, 0);
  });

  it("rejects schedules with too many rows", () => {
    assert.throws(
      () => parseScheduleRows(Array.from({ length: maxScheduleRows + 1 }, () => [])),
      /too many rows/,
    );
  });
});
