import type { FlightAssignment, PlanningRules } from "../types/dispatch";

export function earliestPlanningShiftStartMinutes(
  flights: FlightAssignment[],
  rules: PlanningRules,
  shiftStartIncrementMinutes: number,
) {
  const departureTimes = flights
    .map((flight) => timeToMinutes(flight.etd))
    .filter((minutes) => Number.isFinite(minutes));
  if (departureTimes.length === 0) return 0;

  const firstDeparture = Math.min(...departureTimes);
  const earliestResourceNeed = firstDeparture
    - rules.maxKitchenDepartureBeforeDepartureMinutes
    - rules.firstAircraftSetupMinutes;
  return Math.max(0, snapDownToIncrement(earliestResourceNeed, shiftStartIncrementMinutes));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function snapDownToIncrement(minutes: number, increment: number) {
  return Math.floor(minutes / increment) * increment;
}
