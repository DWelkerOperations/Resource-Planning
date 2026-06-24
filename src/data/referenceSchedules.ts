import type { AirportCode, FlightAssignment } from "../types/dispatch";
import { ordJuneTripmasterDefaultAirport, ordJuneTripmasterDefaultDate, ordJuneTripmasterFileName, ordJuneTripmasterFlights } from "./ordJuneTripmasterFlights";
import { ordMay14DefaultAirport, ordMay14DefaultDate, ordMay14FileName, ordMay14Flights } from "./ordMay14Flights";
import { pdxJune11DefaultAirport, pdxJune11DefaultDate, pdxJune11FileName, pdxJune11Flights } from "./pdxJune11Flights";

export type ReferenceSchedule = {
  id: string;
  label: string;
  fileName: string;
  airport: AirportCode;
  date: string;
  flights: FlightAssignment[];
};

export const ordJuneTripmasterReferenceId = "ord-2026-06-tripmaster";

export const referenceSchedules: ReferenceSchedule[] = [
  {
    id: ordJuneTripmasterReferenceId,
    label: "ORD June TripMaster",
    fileName: ordJuneTripmasterFileName,
    airport: ordJuneTripmasterDefaultAirport,
    date: ordJuneTripmasterDefaultDate,
    flights: ordJuneTripmasterFlights,
  },
  {
    id: "pdx-2026-06-11",
    label: "PDX June 11",
    fileName: pdxJune11FileName,
    airport: pdxJune11DefaultAirport,
    date: pdxJune11DefaultDate,
    flights: pdxJune11Flights,
  },
  {
    id: "ord-2026-05-14",
    label: "ORD May 14",
    fileName: ordMay14FileName,
    airport: ordMay14DefaultAirport,
    date: ordMay14DefaultDate,
    flights: ordMay14Flights,
  },
];
