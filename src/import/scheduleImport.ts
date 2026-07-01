import type { AirportCode, FlightAssignment, ServiceType } from "../types/dispatch";
import { normalizeAirportCode } from "../data/airports";
import { aircraftInterpretations, normalizeAircraftType } from "./aircraftMap";

export type ScheduleFormatId = "standard" | "combined-flight" | "flight-overview" | "operation-plan" | "ua-turns";

export type NormalizedScheduleRow = {
  sourceRowNumber: number;
  departureDate: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  aircraftType: string;
  originSite: string;
  destination: string;
  inboundArrivalTime?: string;
  stripIdentifier?: string;
};

export type ScheduleImportResult = {
  detectedFormat: ScheduleFormatId;
  flights: FlightAssignment[];
  normalizedRows: NormalizedScheduleRow[];
  availableDates: string[];
  skippedRowCount: number;
  warnings: string[];
};

export const maxScheduleFileBytes = 64 * 1024 * 1024;
export const maxScheduleRows = 150000;

type HeaderIndex = Record<string, number>;
type FormatDefinition = {
  id: ScheduleFormatId;
  label: string;
  match: (headers: HeaderIndex) => boolean;
  read: (row: unknown[], sourceRowNumber: number, headers: HeaderIndex) => NormalizedScheduleRow;
};

type ScheduleFileMetadata = Pick<File, "name" | "size" | "type">;

const acceptedScheduleExtensions = new Set([".xls", ".xlsx"]);
const acceptedScheduleMimeTypes = new Set([
  "",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
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
    id: "flight-overview",
    label: "flight overview schedule",
    match: (headers) => has(headers, "flightOverviewDate", "flight", "flightOverviewDepartureTime", "aircraftType", "originSite", "destination"),
    read: (row, sourceRowNumber, headers) => {
      const rawFlight = cellText(row[headers.flight]);
      if (
        cellText(row[headers.flightOverviewDate])
        && isReportTimestamp(rawFlight)
        && !cellText(row[headers.flightOverviewDepartureTime])
        && !cellText(row[headers.aircraftType])
        && !cellText(row[headers.originSite])
        && !cellText(row[headers.destination])
      ) {
        return emptySourceRow(sourceRowNumber);
      }
      const flightParts = splitFlight(cellText(row[headers.flight]));
      return normalizeSourceRow({
        sourceRowNumber,
        departureDate: cellText(row[headers.flightOverviewDate]),
        airline: flightParts.airline,
        flightNumber: flightParts.flightNumber,
        departureTime: cellText(row[headers.flightOverviewDepartureTime]),
        aircraftType: cleanAircraftCode(cellText(row[headers.aircraftType]), flightParts.airline),
        originSite: cellText(row[headers.originSite]),
        destination: cellText(row[headers.destination]),
      });
    },
  },
  {
    id: "ua-turns",
    label: "UA turns report",
    match: (headers) => has(headers, "uaTurnsDate", "uaTurnsArrivalTime", "uaTurnsStrip", "uaTurnsAircraft", "uaTurnsStation", "uaTurnsFlight", "uaTurnsDestination", "uaTurnsDepartureTime"),
    read: (row, sourceRowNumber, headers) => normalizeSourceRow({
      sourceRowNumber,
      departureDate: cellText(row[headers.uaTurnsDate]),
      airline: "UA",
      flightNumber: cellText(row[headers.uaTurnsFlight]),
      departureTime: cellText(row[headers.uaTurnsDepartureTime]),
      aircraftType: cellText(row[headers.uaTurnsAircraft]),
      originSite: cellText(row[headers.uaTurnsStation]),
      destination: cellText(row[headers.uaTurnsDestination]),
      inboundArrivalTime: cellText(row[headers.uaTurnsArrivalTime]),
      stripIdentifier: cellText(row[headers.uaTurnsStrip]),
    }),
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
  departure: "departureDate",
  "departure date": "departureDate",
  departuredate: "departureDate",
  depdate: "departureDate",
  airline: "airline",
  airln: "airline",
  carrier: "carrier",
  al: "airline",
  flight: "flight",
  board: "flightNumber",
  "flight number": "flightNumber",
  flightnumber: "flightNumber",
  flt: "flightNumber",
  number: "number",
  "flt no": "flightNumber",
  "flt #": "flightNumber",
  depart: "departureTime",
  etd: "etd",
  "field departure": "departureTime",
  "field departure time": "departureTime",
  field: "departureTime",
  "departure time": "departureTime",
  departuretime: "departureTime",
  time: "departureTime",
  aircraft: "aircraftType",
  ac: "aircraftType",
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

function emptySourceRow(sourceRowNumber: number): NormalizedScheduleRow {
  return {
    sourceRowNumber,
    departureDate: "",
    airline: "",
    flightNumber: "",
    departureTime: "",
    aircraftType: "",
    originSite: "",
    destination: "",
  };
}

export async function parseScheduleFile(file: File): Promise<ScheduleImportResult> {
  validateScheduleFileMetadata(file);
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (workbook.SheetNames.length > 20) {
    throw new Error("The workbook has too many sheets. Upload a schedule workbook with 20 sheets or fewer.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a readable schedule sheet.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (rows.length > maxScheduleRows) {
    throw new Error(`The schedule has too many rows. Upload a schedule with ${maxScheduleRows.toLocaleString()} rows or fewer.`);
  }
  return parseScheduleRows(rows);
}

export function validateScheduleFileMetadata(file: ScheduleFileMetadata) {
  const normalizedName = file.name.trim().toLowerCase();
  const extension = normalizedName.includes(".") ? normalizedName.slice(normalizedName.lastIndexOf(".")) : "";

  if (!acceptedScheduleExtensions.has(extension)) {
    throw new Error("Upload an Excel schedule file ending in .xlsx or .xls.");
  }

  if (file.size <= 0) {
    throw new Error("The selected schedule file is empty.");
  }

  if (file.size > maxScheduleFileBytes) {
    throw new Error(`The selected schedule is too large. Upload a file smaller than ${formatBytes(maxScheduleFileBytes)}.`);
  }

  if (!acceptedScheduleMimeTypes.has(file.type)) {
    throw new Error("The selected file type is not recognized as an Excel workbook.");
  }
}

export function parseScheduleRows(rows: unknown[][]): ScheduleImportResult {
  if (rows.length > maxScheduleRows) {
    throw new Error(`The schedule has too many rows. Upload a schedule with ${maxScheduleRows.toLocaleString()} rows or fewer.`);
  }

  const detected = detectScheduleFormat(rows);
  if (!detected) {
    throw new Error("Unknown schedule format. Include headers for date, flight or airline/flight number, departure time, aircraft, origin site, and destination.");
  }

  const warnings: string[] = [];
  const seenFlights = new Set<string>();
  const validRows: NormalizedScheduleRow[] = [];
  let skippedRowCount = 0;

  for (let index = detected.headerRowIndex + 1; index < rows.length; index += 1) {
    const sourceRow = rows[index] ?? [];
    if (sourceRow.every((cell) => !cellText(cell))) continue;

    const row = detected.definition.read(sourceRow, index + 1, detected.headers);
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
    availableDates: [...new Set(validRows.map((row) => row.departureDate))].sort(),
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
  const headers = headerRow.reduce<HeaderIndex>((currentHeaders, value, index) => {
    const key = headerAliases[normalizeHeader(value)];
    if (key && currentHeaders[key] === undefined) currentHeaders[key] = index;
    return currentHeaders;
  }, {});

  const normalizedHeaders = headerRow.map(normalizeHeader);
  if (normalizedHeaders[0] === "depart" && normalizedHeaders[1] === "flight" && normalizedHeaders[2] === "depart") {
    headers.flightOverviewDate = 0;
    headers.flightOverviewDepartureTime = 2;
  }
  if (
    normalizedHeaders[0] === "arrv date"
    && normalizedHeaders[1] === "flight"
    && normalizedHeaders[3] === "arrives"
    && normalizedHeaders[5] === "term"
    && normalizedHeaders[6] === "a/c"
    && normalizedHeaders[7] === "station"
    && normalizedHeaders[8] === "flight"
    && normalizedHeaders[9] === "to"
    && normalizedHeaders[10] === "departs"
  ) {
    headers.uaTurnsDate = 0;
    headers.uaTurnsArrivalTime = 3;
    headers.uaTurnsStrip = 5;
    headers.uaTurnsAircraft = 6;
    headers.uaTurnsStation = 7;
    headers.uaTurnsFlight = 8;
    headers.uaTurnsDestination = 9;
    headers.uaTurnsDepartureTime = 10;
  }

  return headers;
}

function normalizeSourceRow(row: NormalizedScheduleRow): NormalizedScheduleRow {
  const originSite = normalizeAirport(row.originSite) ?? row.originSite.trim().toUpperCase();
  const aircraftType = normalizeAircraftType(row.aircraftType);
  const unsupportedAircraft = row.aircraftType && !isSupportedAircraft(row.aircraftType);
  const inboundArrivalTime = row.inboundArrivalTime ? normalizeTime(row.inboundArrivalTime) : "";
  const stripIdentifier = row.stripIdentifier?.trim() ?? "";

  return {
    sourceRowNumber: row.sourceRowNumber,
    departureDate: normalizeDate(row.departureDate),
    airline: row.airline.trim().toUpperCase(),
    flightNumber: cleanFlightNumber(row.flightNumber),
    departureTime: normalizeTime(row.departureTime),
    aircraftType: unsupportedAircraft ? "Unknown" : aircraftType || "Unknown",
    originSite,
    destination: row.destination.trim().toUpperCase(),
    ...(inboundArrivalTime ? { inboundArrivalTime } : {}),
    ...(stripIdentifier ? { stripIdentifier } : {}),
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
  const serviceType: ServiceType = row.stripIdentifier ? "intl-strip" : row.airline.toUpperCase() === "UA" ? "load-ua" : "load-other";
  const start = addMinutes(row.departureTime, -85);
  const end = addMinutes(row.departureTime, -35);
  const inboundNote = row.inboundArrivalTime ? ` Planned inbound arrival ${row.inboundArrivalTime}.` : "";
  const stripNote = row.stripIdentifier ? ` Strip: ${row.stripIdentifier}.` : "";

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
    inboundEta: row.inboundArrivalTime || "-",
    aircraft: row.aircraftType,
    serviceType,
    originAirport: normalizeAirport(row.originSite),
    destinationAirport: row.destination,
    notes: `Imported ${row.departureDate}. From ${row.originSite} to ${row.destination}.${inboundNote}${stripNote}`,
  };
}

function isNonEmptyScheduleRow(row: NormalizedScheduleRow) {
  if (row.departureDate && !row.airline && !row.flightNumber && row.departureTime && !row.aircraftType && !row.originSite && !row.destination) return false;
  if (row.departureDate && !row.airline && isReportTimestamp(row.flightNumber) && !row.departureTime && !row.aircraftType && !row.originSite && !row.destination) return false;
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
  const separated = value.trim().match(/^([A-Z0-9]{1,3})\s+([A-Z0-9]+)$/i) ?? value.trim().match(/^([A-Z0-9]{1,3})\s*-\s*([A-Z0-9]+)$/i);
  if (separated) return { airline: separated[1].toUpperCase(), flightNumber: separated[2].toUpperCase() };

  const compact = value.trim().match(/^([A-Z]{1,3})([A-Z0-9]+)$/i);
  if (compact) return { airline: compact[1].toUpperCase(), flightNumber: compact[2].toUpperCase() };

  return { airline: "", flightNumber: value.trim() };
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

  const monthNameDate = date.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{2}|\d{4})$/);
  if (monthNameDate) {
    const [, day, monthName, rawYear] = monthNameDate;
    const month = monthNumber(monthName);
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return month && validDateParts(year, month, day) ? `${year}-${month}-${day.padStart(2, "0")}` : "";
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
    /^19[A-Z]?$/.test(compact) ||
    /^2(0|2)[A-Z0-9]?$/.test(compact) ||
    /^21[A-Z]?$/.test(compact) ||
    /^32[A-Z0-9]?$/.test(compact) ||
    /^33[A-Z0-9]?$/.test(compact) ||
    /^3[27][A-Z0-9]?$/.test(compact) ||
    /^38[A-Z0-9]?$/.test(compact) ||
    /^73[A-Z0-9]{0,2}$/.test(compact) ||
    /^74[A-Z0-9]?$/.test(compact) ||
    /^71[A-Z0-9]?$/.test(compact) ||
    /^(B)?7(37|38|39|3G|3H|3J|3M|3R|3W|57|67|77|87)/.test(compact) ||
    /^7M[789]$/.test(compact) ||
    /^7[36][A-Z0-9]{1,2}$/.test(compact) ||
    /^77[A-Z0-9]{1,2}$/.test(compact) ||
    /^78[A-Z0-9]{1,2}$/.test(compact) ||
    /^[89]EP[89][RW]P$/.test(compact) ||
    /^E(170|175|190|195)$/.test(compact) ||
    /^E7[A-Z0-9]?$/.test(compact) ||
    /^ERJ$/.test(compact) ||
    /^8CE$/.test(compact) ||
    /^C5G$/.test(compact) ||
    /^CR[5-9]$/.test(compact) ||
    /^CRJ\d{0,3}$/.test(compact)
  );
}

function validDateParts(year: string, month: string, day: string) {
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(normalized);
}

function monthNumber(value: string) {
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase()) + 1;
  return month > 0 ? String(month).padStart(2, "0") : "";
}

function has(headers: HeaderIndex, ...keys: string[]) {
  return keys.every((key) => headers[key] !== undefined);
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

function isReportTimestamp(value: string) {
  return /^\d{1,2}:\d{2}:?\s*$/.test(value);
}
