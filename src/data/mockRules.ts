import type { RuleItem } from "../types/dispatch";
import { sampleAirportOptions } from "./airports";
import { planningRules } from "./planningRules";

export function ruleItemsFromPlanningRules(rules = planningRules): RuleItem[] {
  const defaultDriveReturn = `${rules.mainlineDriveOutMinutes}/${rules.mainlineReturnMinutes} min`;
  const siteOverrides = rules.siteOverrides ?? {};
  const driveReturnOverrides = Object.entries(siteOverrides)
    .map(([site, override]) => ({
      site,
      driveOutMinutes: override.driveOutMinutes ?? rules.mainlineDriveOutMinutes,
      returnMinutes: override.returnMinutes ?? rules.mainlineReturnMinutes,
    }))
    .filter((override) => override.driveOutMinutes !== rules.mainlineDriveOutMinutes || override.returnMinutes !== rules.mainlineReturnMinutes);
  const driveReturnOverrideText = driveReturnOverrides.length > 0
    ? driveReturnOverrides.map((override) => `${override.site} ${override.driveOutMinutes}/${override.returnMinutes} min`).join("; ")
    : "None";
  const gateMoveOverrides = Object.entries(siteOverrides)
    .filter(([, override]) => override.gateToGateMoveMinutes !== undefined)
    .map(([site, override]) => `${site} ${override.gateToGateMoveMinutes} min`);
  const dockToFinalCateringOverrides = Object.entries(siteOverrides)
    .filter(([, override]) => override.maxDockDepartureToFinalServiceEndMinutes !== undefined)
    .map(([site, override]) => `${site} ${override.maxDockDepartureToFinalServiceEndMinutes} min`);
  const globalDockToFinalCatering = rules.earliestCateringBeforeDepartureMinutes - rules.firstAircraftSetupMinutes;
  const dockToFinalCateringText = dockToFinalCateringOverrides.length > 0
    ? `All kitchens ${globalDockToFinalCatering} min; overrides: ${dockToFinalCateringOverrides.join("; ")}`
    : `All kitchens ${globalDockToFinalCatering} min (${rules.earliestCateringBeforeDepartureMinutes} min food-safety max - ${rules.firstAircraftSetupMinutes} min dock load)`;
  const overrideSites = new Set(driveReturnOverrides.map((override) => override.site));
  const defaultSites = sampleAirportOptions.filter((site) => !overrideSites.has(site));

  return [
  { id: "r1", category: "Preferred on", setting: "Express / narrowbody / 757 / widebody", value: "40 / 50 / 65 / 90 min" },
  { id: "r2", category: "Hard off", setting: "Domestic / international", value: `${rules.hardMinimumCompletionBeforeDepartureMinutes} / 30 min` },
  { id: "r3", category: "Food safety", setting: "Latest dispatch departure", value: `No earlier than D-${rules.maxKitchenDepartureBeforeDepartureMinutes}` },
  { id: "r4", category: "Drive / return", setting: "Site drive overrides", value: `Default drive/return ${defaultDriveReturn}. CSC differences: ${driveReturnOverrideText}. ${defaultSites.length > 0 ? `${defaultSites.join(", ")} use default.` : "All configured CSCs differ from default."}` },
  { id: "r5", category: "Load sequence", setting: "Load / dock prep", value: `${rules.firstAircraftSetupMinutes} min` },
  { id: "r6", category: "Shift lengths", setting: "Standard driver shift", value: `${rules.standardShiftHours} paid hr + ${rules.lunchMinutes} min unpaid lunch` },
  { id: "r7", category: "Lunch", setting: "Protection window", value: "None; only a 30 min lunch gap is required" },
  { id: "r8", category: "Service times", setting: "Express / narrowbody / 757 / widebody", value: `${rules.serviceMinutesByAircraftCategory.regional} / ${rules.serviceMinutesByAircraftCategory.narrowbody} / 40 / ${rules.serviceMinutesByAircraftCategory.widebody} min` },
  { id: "r9", category: "Helpers", setting: "Mainline helper required", value: rules.helperRequiredForMainline ? "Yes" : "No" },
  { id: "r10", category: "Equipment", setting: "767 / 777-787 / narrowbody / express", value: "1x22 / 2x22 / 16 or 22 / SOV" },
  { id: "r11", category: "Pairing", setting: "Widebody grouping", value: "Standalone protected push" },
  { id: "r12", category: "Pairing", setting: "Mixed regional/mainline", value: "Not allowed" },
  { id: "r13", category: "Pairing", setting: "Unknown aircraft", value: "Do not pair; critical risk" },
  { id: "r14", category: "Pairing", setting: "Max flights per push", value: `${rules.maxFlightsPerPush}` },
  { id: "r15", category: "Pairing", setting: "Group window", value: `${rules.groupWindowMinutes} min` },
  { id: "r16", category: "Pairing", setting: "Max workload per push", value: `${rules.maxWorkloadUnitsPerPush}` },
  { id: "r17", category: "Risk", setting: "Watch / urgent / critical", value: "6-10 min / 0-5 min / past hard off" },
  { id: "r18", category: "Shifts", setting: "Crew ready after shift start", value: "15 min" },
  { id: "r19", category: "Lunch", setting: "Required lunch gap", value: `${rules.lunchMinutes} min, no buffers` },
  { id: "r20", category: "Scope", setting: "Shift guide cancellations", value: "Out of scope; no cancellations" },
  { id: "r21", category: "Planning priority", setting: "Optimization order", value: "No delays, drivers, utilization, 3-flight pairings, idle, OT, trucks" },
  { id: "r22", category: "Drive / return", setting: "Site seal-break override", value: "Optional site override before service starts" },
  { id: "r23", category: "Drive / return", setting: "Site gate-to-gate move", value: gateMoveOverrides.length > 0 ? gateMoveOverrides.join("; ") : "Optional site override for between-gate route time" },
  { id: "r24", category: "Drive / return", setting: "Unload release", value: "15 min after return; driver and truck unavailable until complete" },
  { id: "r25", category: "Food safety", setting: "Dock to final catering end", value: dockToFinalCateringText },
  ];
}

export const mockRules: RuleItem[] = ruleItemsFromPlanningRules();

export const openRuleQuestions: RuleItem[] = [
  { id: "q1", category: "Dispatcher cancellations", setting: "Cancellation status source", value: "How will a canceled flight be represented in imported/live schedule data?" },
  { id: "q2", category: "Dispatcher cancellations", setting: "Cancellation behavior", value: "Should canceled flights be hidden, retained as no-work audit rows, or shown in a separate exception lane?" },
  { id: "q3", category: "Swipe validation", setting: "Required swipe events", value: "Which timestamps are required: dispatch out, gate arrival, service start, service complete, return?" },
  { id: "q4", category: "Swipe validation", setting: "Exception handling", value: "What should happen for missing, late, duplicate, or manually corrected swipes?" },
  { id: "q5", category: "Security boundaries", setting: "Role permissions", value: "Which roles can edit rules, import schedules, override pairings, close exceptions, or view audit history?" },
  { id: "q6", category: "Security boundaries", setting: "Audit requirements", value: "Which operational changes require user, timestamp, before/after value, and reason capture?" },
];
