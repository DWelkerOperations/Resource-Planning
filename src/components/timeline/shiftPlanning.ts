import type { Driver, Push } from "../../types/dispatch";
import { timeToMinutes } from "./timelineUtils";

const kitchenUnloadMinutes = 15;

export type PlannedShift = {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  activeStartMinutes: number;
  activeEndMinutes: number;
  overflowMinutes: number;
  utilizationMinutes: number;
};

export function plannedShiftForDriver(driver: Driver, pushes: Push[]): PlannedShift {
  const displayStart = driver.displayShiftStart ?? driver.shiftStart;
  const displayEnd = driver.displayShiftEnd ?? driver.shiftEnd;
  const startMinutes = timeToMinutes(displayStart);
  const endMinutes = timeToMinutes(displayEnd);

  if (pushes.length === 0) {
    return {
      start: displayStart,
      end: displayEnd,
      startMinutes,
      endMinutes,
      activeStartMinutes: startMinutes,
      activeEndMinutes: startMinutes,
      overflowMinutes: 0,
      utilizationMinutes: 0,
    };
  }

  const activeStartMinutes = Math.min(...pushes.map((push) => timeToMinutes(push.loadStartTime)));
  const activeEndMinutes = Math.max(...pushes.map((push) => timeToMinutes(push.returnTime) + kitchenUnloadMinutes));
  const utilizationMinutes = pushes.reduce((total, push) => total + push.totalDurationMinutes, 0);

  return {
    start: displayStart,
    end: displayEnd,
    startMinutes,
    endMinutes,
    activeStartMinutes,
    activeEndMinutes,
    overflowMinutes: Math.max(0, activeEndMinutes - endMinutes),
    utilizationMinutes,
  };
}

export function minutesToTime(totalMinutes: number) {
  const normalized = Math.max(0, totalMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
