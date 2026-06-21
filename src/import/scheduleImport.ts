import type { AirportCode, FlightAssignment, ServiceType } from "../types/dispatch";
import { normalizeAirportCode } from "../data/airports";
import { aircraftInterpretations, normalizeAircraftType } from "./aircraftMap";

export type ScheduleFormatId = "standard" | "combined-flight" | "operation-plan";

export type NormalizedScheduleRow = {
  sourceRowNumber: number;
  departureDate: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  aircraftType: string;
  originSite: string;
  destination: string;
};

export type ScheduleImportResult = {
  detectedFormat: ScheduleFormatId;
  flights: FlightAssignment[];
  normalizedRows: NormalizedScheduleRow[];
  skippedRowCount: number;
  warnings: string[];
};

type HeaderIndex = Record<string, number>;
type FormatDefinition = {
  id: ScheduleFormatId;
  label: string;
  match: (headers: HeaderIndex) => boolean;
  read: (row: unknown[], sourceRowNumber: number, headers: HeaderIndex) => NormalizedScheduleRow;
};

const aircraftCodeSet = new Set(aircraftInterpretations.map((item) => item.inputName.toUpperCase()));
const aircraftNameSet = new Set(aircraftInterpretations.map((item) => item.standardName.toUpperCase()));

const formatDefinitions: FormatDefinition[] = [
  {
    id: "standard",
    label: "standard airline schedule",
    match: (headers) => has(headers, "departureDate", "airline", "flightNumber", "departureTime", "aircraftType", "originSite", "destination"),
    read: (row, sourceRowNumber, headers) => normalizeSourceRow({
      sourceRowNumber,
      departureDate: cellText(row[headers.departureDate]),
      airline: cellText(row[headers.airline]),
      flightNumber: cellText(row[headers.flightNumber]),
      departureTime: cellText(row[headers.departureTime]),
      aircraftType: cellText(row[headers.aircraftType]),
      originSite: cellText(row[headers.originSite]),
      destination: cellText(row[headers.destination]),
    }),
  },
  {
    id: "combined-flight",
    label: "combined flight schedule",
    match: (headers) => has(headers, "departureDate", "flight", "departureTime", "aircraftType", "originSite", "destination"),
    read: (row, sourceRowNumber, headers) => {
      const flightParts = splitFlight(cellText(row[headers.flight]));
      return normalizeSourceRow({
        sourceRowNumber,
        departureDate: cellText(row[headers.departureDate]),
        airline: flightParts.airline,
        flightNumber: flightParts.flightNumber,
        departureTime: cellText(row[headers.departureTime]),
        aircraftType: cleanAircraftCode(cellText(row[headers.aircraftType]), flightParts.airline),
        originSite: cellText(row[headers.originSite]),
        destination: cellText(row[headers.destination]),
      });
    },
  },
  {
    id: "operation-plan",
    label: "operation plan schedule",
    match: (headers) => has(headers, "departureDate", "carrier", "number", "etd", "fleet", "site", "routeTo"),
    read: (row, sourceRowNumber, headers) => normalizeSourceRow({
      sourceRowNumber,
      departureDate: cellText(row[headers.departureDate]),
      airline: cellText(row[headers.carrier]),
      flightNumber: cellText(row[headers.number]),
      departureTime: cellText(row[headers.etd]),
      aircraftType: cellText(row[headers.fleet]),
      originSite: cellText(row[headers.site]),
      destination: cellText(row[headers.routeTo]),
    }),
  },
];

const headerAliases: Record<string, string> = {
  date: "departureDate",
  "departure date": "departureDate",
  departuredate: "departureDate",
  depdate: "departureDate",
  airline: "airline",
  carrier: "carrier",
  al: "airline",
  flight: "flight",
  "flight number": "flightNumber",
  flightnumber: "flightNumber",
  flt: "flightNumber",
  number: "number",
  "flt no": "flightNumber",
  "flt #": "flightNumber",
  etd: "etd",
  "field departure": "departureTime",
  "field departure time": "departureTime",
  field: "departureTime",
  "departure time": "departureTime",
  departuretime: "departureTime",
  time: "departureTime",
  aircraft: "aircraftType",
  "aircraft type": "aircraftType",
  aircrafttype: "aircraftType",
  fleet: "fleet",
  equipment: "aircraftType",
  kitchen: "kitchenTime",
  from: "originSite",
  origin: "originSite",
  "origin site": "originSite",
  originsite: "originSite",
  site: "site",
  to: "destination",
  destination: "destination",
  dest: "destination",
  "route to": "routeTo",
  routeto: "routeTo",
};

export async function parseScheduleFile(file: File): Promise<ScheduleImportResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a readable schedule sheet.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  return parseScheduleRows(rows);
}

export function parseScheduleRows(rows: unknown[][]): ScheduleImportResult {
  const detected = detectScheduleFormat(rows);
  if (!detected) {
    throw new Error("Unknown schedule format. Include headers for date, flight or airline/flight number, departure time, aircraft, origin site, and destination.");
  }

  const warnings: string[] = [];
  const seenFlights = new Set<string>();
  const validRows: NormalizedScheduleRow[] = [];
  let skippedRowCount = 0;

  for (let index = detected.headerRowIndex + 1; index < rows.length; index += 1) {
    const row = detected.definition.read(rows[index] ?? [], index + 1, detected.headers);
    if (!isNonEmptyScheduleRow(row)) continue;

    const rowWarnings = validateNormalizedRow(row);
    const duplicateKey = normalizedFlightKey(row);
    if (duplicateKey && seenFlights.has(duplicateKey)) {
      rowWarnings.push(`Row ${row.sourceRowNumber}: duplicate flight ${row.airline}${row.flightNumber} at ${row.departureTime} was skipped.`);
    }

    if (rowWarnings.length > 0) {
      warnings.push(...rowWarnings);
      skippedRowCount += 1;
      continue;
    }

    seenFlights.add(duplicateKey);
    validRows.push(row);
  }

  if (validRows.length === 0 && warnings.length > 0) {
    const visibleErrors = warnings.slice(0, 3).join(" ");
    const remainingCount = warnings.length - 3;
    throw new Error(`${visibleErrors}${remainingCount > 0 ? ` ${remainingCount} more row(s) failed validation.` : ""}`);
  }

  if (validRows.length === 0) throw new Error("No valid flight rows were found in the schedule.");

  return {
    detectedFormat: detected.definition.id,
    flights: validRows.map(toFlightAssignment),
    normalizedRows: validRows,
    skippedRowCount,
    warnings,
  };
}

function detectScheduleFormat(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 5); index += 1) {
    const headers = buildHeaderIndex(rows[index] ?? []);
    const definition = formatDefinitions.find((format) => format.match(headers));
    if (definition) return { definition, headerRowIndex: index, headers };
  }
  return null;
}

function buildHeaderIndex(headerRow: unknown[]) {
  return headerRow.reduce<HeaderIndex>((headers, value, index) => {
    const key = headerAliases[normalizeHeader(value)];
    if (key && headers[key] === undefined) headers[key] = index;
    return headers;
  }, {});
}

function normalizeSourceRow(row: NormalizedScheduleRow): NormalizedScheduleRow {
  const originSite = normalizeAirport(row.originSite) ?? row.originSite.trim().toUpperCase();
  const aircraftType = normalizeAircraftType(row.aircraftType);
  const unsupportedAircraft = row.aircraftType && !isSupportedAircraft(row.aircraftType);

  return {
    sourceRowNumber: row.sourceRowNumber,
    departureDate: normalizeDate(row.departureDate),
    airline: row.airline.trim().toUpperCase(),
    flightNumber: cleanFlightNumber(row.flightNumber),
    departureTime: normalizeTime(row.departureTime),
    aircraftType: unsupportedAircraft ? "Unknown" : aircraftType || "Unknown",
    originSite,
    destination: row.destination.trim().toUpperCase(),
  };
}

function validateNormalizedRow(row: NormalizedScheduleRow) {
  const errors: string[] = [];
  const rowLabel = `Row ${row.sourceRowNumber}`;

  if (!row.airline) errors.push(`${rowLabel}: missing airline.`);
  if (!row.flightNumber) errors.push(`${rowLabel}: missing flight number.`);
  if (!row.departureTime) errors.push(`${rowLabel}: missing departure time.`);
  else if (!isValidTime(row.departureTime)) errors.push(`${rowLabel}: invalid departure time "${row.departureTime}".`);
  if (!row.originSite) errors.push(`${rowLabel}: missing origin site.`);
  else if (!normalizeAirport(row.originSite)) errors.push(`${rowLabel}: invalid origin site "${row.originSite}". Use a 3-4 character airport/site code.`);
  if (!row.departureDate) errors.push(`${rowLabel}: missing or invalid departure date.`);
  if (row.aircraftType === "Unknown") errors.push(`${rowLabel}: unsupported aircraft type; row was skipped.`);

  return errors;
}

function toFlightAssignment(row: NormalizedScheduleRow, index: number): FlightAssignment {
  const serviceType: ServiceType = row.airline.toUpperCase() === "UA" ? "load-ua" : "load-other";
  const start = addMinutes(row.departureTime, -85);
  const end = addMinutes(row.departureTime, -35);

  return {
    id: `import-${index + 1}`,
    driverId: null,
    flightNumber: `${row.airline}${row.flightNumber}`,
    departureDate: row.departureDate,
    gate: row.destination || "TBD",
    start,
    end,
    etd: row.departureTime,
    eta: "-",
    inboundEta: "-",
    aircraft: row.aircraftType,
    serviceType,
    originAirport: normalizeAirport(row.originSite),
    destinationAirport: row.destination,
    notes: `Imported ${row.departureDate}. From ${row.originSite} to ${row.destination}.`,
  };
}

function isNonEmptyScheduleRow(row: NormalizedScheduleRow) {
  return Boolean(row.departureDate || row.airline || row.flightNumber || row.departureTime || row.aircraftType || row.originSite || row.destination);
}

function normalizedFlightKey(row: NormalizedScheduleRow) {
  if (!row.departureDate || !row.originSite || !row.airline || !row.flightNumber || !row.departureTime) return "";
  return [row.departureDate, row.originSite, row.airline, row.flightNumber, row.departureTime].join("|");
}

function normalizeAirport(value: string): AirportCode | undefined {
  return normalizeAirportCode(value);
}

function splitFlight(value: string) {
  const match = value.trim().match(/^([A-Z]{1,3})\s*[- ]?\s*([A-Z0-9]+)$/i);
  if (!match) return { airline: "", flightNumber: value.trim() };
  return { airline: match[1].toUpperCase(), flightNumber: match[2].toUpperCase() };
}

function cleanAircraftCode(value: string, airline: string) {
  const aircraft = value.trim().toUpperCase();
  if (!airline) return aircraft;
  return aircraft.replace(new RegExp(`^${airline}\\s+`, "i"), "");
}

function cleanFlightNumber(value: string) {
  return value.trim().toUpperCase().replace(/^0+(\d)/, "$1");
}

function normalizeDate(value: string) {
  const date = value.trim();
  const slashDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashDate) {
    const [, month, day, rawYear] = slashDate;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return validDateParts(year, month, day) ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
  }

  const isoDate = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return validDateParts(year, month, day) ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
  }

  return "";
}

function normalizeTime(value: string) {
  const trimmed = value.trim();
  const compact = trimmed.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return `${compact[1].padStart(2, "0")}:${compact[2]}`;

  const match = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = Math.max(0, hours * 60 + minutes + minutesToAdd);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function isValidTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 47 && minutes >= 0 && minutes <= 59;
}

function isSupportedAircraft(value: string) {
  const normalized = normalizeAircraftType(value).toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  const raw = value.trim().toUpperCase();
  if (!raw || raw === "-" || raw === "UNKNOWN" || raw === "TBD") return false;
  if (aircraftCodeSet.has(raw) || aircraftNameSet.has(normalized)) return true;
  return (
    /^(A)?3(19|20|21|2N|2S)$/.test(compact) ||
    /^(B)?7(37|38|39|3G|3H|3J|3M|3R|3W|57|67|77|87)/.test(compact) ||
    /^7M[789]$/.test(compact) ||
    /^E(170|175|190|195)$/.test(compact) ||
    /^CRJ\d{0,3}$/.test(compact)
  );
}

function validDateParts(year: string, month: string, day: string) {
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(normalized);
}

function has(headers: HeaderIndex, ...keys: string[]) {
  return keys.every((key) => headers[key] !== undefined);
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}
