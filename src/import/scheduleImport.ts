import * as XLSX from "xlsx";
import type { FlightAssignment, ServiceType } from "../types/dispatch";
import { normalizeAircraftType } from "./aircraftMap";

type ScheduleRow = {
  departureDate: string;
  airline: string;
  flightNumber: string;
  fieldDepartureTime: string;
  aircraftType: string;
  originKitchen: string;
  destination: string;
};

const columnMap = {
  departureDate: 0,
  airline: 1,
  flightNumber: 2,
  fieldDepartureTime: 4,
  aircraftType: 8,
  originKitchen: 9,
  destination: 10,
};

export async function parseScheduleFile(file: File): Promise<FlightAssignment[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });

  return rows
    .slice(1)
    .map(readScheduleRow)
    .filter(isValidScheduleRow)
    .map(toFlightAssignment);
}

function readScheduleRow(row: unknown[]): ScheduleRow {
  return {
    departureDate: cellText(row[columnMap.departureDate]),
    airline: cellText(row[columnMap.airline]),
    flightNumber: cellText(row[columnMap.flightNumber]),
    fieldDepartureTime: normalizeTime(cellText(row[columnMap.fieldDepartureTime])),
    aircraftType: normalizeAircraftType(cellText(row[columnMap.aircraftType])),
    originKitchen: cellText(row[columnMap.originKitchen]),
    destination: cellText(row[columnMap.destination]),
  };
}

function isValidScheduleRow(row: ScheduleRow) {
  return Boolean(row.airline && row.flightNumber && row.fieldDepartureTime && row.originKitchen);
}

function toFlightAssignment(row: ScheduleRow, index: number): FlightAssignment {
  const serviceType: ServiceType = row.airline.toUpperCase() === "UA" ? "load-ua" : "load-other";
  const start = addMinutes(row.fieldDepartureTime, -85);
  const end = addMinutes(row.fieldDepartureTime, -35);

  return {
    id: `import-${index + 1}`,
    driverId: null,
    flightNumber: `${row.airline}${row.flightNumber}`,
    gate: row.destination || "TBD",
    start,
    end,
    etd: row.fieldDepartureTime,
    eta: "-",
    inboundEta: "-",
    aircraft: row.aircraftType || "Unknown",
    serviceType,
    notes: `Imported ${row.departureDate}. From ${row.originKitchen} to ${row.destination}.`,
  };
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeTime(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = Math.max(0, hours * 60 + minutes + minutesToAdd);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
