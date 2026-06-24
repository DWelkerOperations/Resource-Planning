import { planningRules } from "../data/planningRules";
import { categoryForAircraft, is757Aircraft, isTwoTruckWidebodyAircraft } from "../import/aircraftMap";
import type { AircraftCategory, Driver, Flight, FlightAssignment, Helper, OperationType, OperationView, PairingStrategy, PlanningRules, Push, ResourceInputs, RiskSeverity, ScheduleException, ScheduleResult, ServiceEvent, ServiceType, Truck } from "../types/dispatch";
import { isInternationalDestination } from "../utils/destinations";
import { resourceIds } from "../utils/resources";

type ResourceAssignment = { start: number; end: number };
type ResourcePoolItem = { id: string; availableAt: number; shiftStart?: number; shiftEnd?: number; firstDeparture?: number; assignedCount: number; vehicleType?: Truck["vehicleType"]; assignments: ResourceAssignment[] };
type ScheduleOptions = { operationType?: OperationType; rules?: PlanningRules; pairingStrategy?: PairingStrategy };

const kitchenUnloadMinutes = 15;
const standardPlanningPairingStrategy: PairingStrategy = { targetThreeFlightPairingPercent: 80 };

export function createPlanningSchedule(assignments: FlightAssignment[], drivers: Driver[], helpers: Helper[], trucks: Truck[], options: ScheduleOptions = {}): ScheduleResult {
  const rules = options.rules ?? planningRules;
  const pairingStrategy = options.pairingStrategy ?? standardPlanningPairingStrategy;
  if (!options.operationType && usesSharedResourcePool(assignments, rules)) return createSinglePlanningSchedule(assignments, drivers, helpers, trucks, rules, undefined, pairingStrategy);
  if (!options.operationType) return createIndependentOperationPlanningSchedule(assignments, drivers, helpers, trucks, rules, pairingStrategy);
  return createSinglePlanningSchedule(assignments, drivers, helpers, trucks, rules, options.operationType, pairingStrategy);
}

function usesSharedResourcePool(assignments: FlightAssignment[], rules: PlanningRules) {
  const workingFlights = assignments.filter((flight) => flight.serviceType !== "break");
  return workingFlights.length > 0 && workingFlights.every((flight) => siteRules(rules, flight.originAirport).sharedResourcePool);
}

function createSinglePlanningSchedule(assignments: FlightAssignment[], drivers: Driver[], helpers: Helper[], trucks: Truck[], rules: PlanningRules, operationType?: OperationType, pairingStrategy?: PairingStrategy): ScheduleResult {
  const flights = toFlights(assignments, rules, operationType);
  const candidatePushes = optimizePairings(buildCandidatePucks(flights, rules), rules, pairingStrategy);
  const scheduledPushes = assignUnlimitedResources(candidatePushes, drivers, helpers, trucks, rules, pairingStrategy);
  return buildResult("planning", scheduledPushes, [], rules);
}

function createIndependentOperationPlanningSchedule(assignments: FlightAssignment[], drivers: Driver[], helpers: Helper[], trucks: Truck[], rules: PlanningRules, pairingStrategy?: PairingStrategy): ScheduleResult {
  const mainline = prefixScheduleResult(
    createSinglePlanningSchedule(assignments, prefixDrivers(drivers, "mainline"), prefixHelpers(helpers, "mainline"), prefixTrucks(trucks, "mainline"), rules, "mainline", pairingStrategy),
    "M",
  );
  const express = prefixScheduleResult(
    createSinglePlanningSchedule(assignments, prefixDrivers(drivers, "express"), prefixHelpers(helpers, "express"), prefixTrucks(trucks, "express"), rules, "express", pairingStrategy),
    "E",
  );

  return buildResult("planning", [...mainline.pushes, ...express.pushes].sort(byDeparture), [...mainline.exceptions, ...express.exceptions], rules);
}

function prefixDrivers(drivers: Driver[], operationType: OperationType): Driver[] {
  return drivers.map((driver) => ({
    ...driver,
    id: `${operationType}-${driver.id}`,
    name: `${operationLabel(operationType)} ${driver.name}`,
  }));
}

function prefixHelpers(helpers: Helper[], operationType: OperationType): Helper[] {
  return helpers.map((helper) => ({
    ...helper,
    id: `${operationType}-${helper.id}`,
    name: `${operationLabel(operationType)} ${helper.name}`,
  }));
}

function prefixTrucks(trucks: Truck[], operationType: OperationType): Truck[] {
  return trucks.map((truck) => ({
    ...truck,
    id: `${operationType}-${truck.id}`,
    truckNumber: `${operationType === "mainline" ? "M" : "E"}-${truck.truckNumber}`,
  }));
}

function prefixScheduleResult(result: ScheduleResult, prefix: string): ScheduleResult {
  const pushIdMap = new Map(result.pushes.map((push) => [push.id, `${prefix}-${push.id}`]));
  return {
    ...result,
    pushes: result.pushes.map((push) => ({
      ...push,
      id: pushIdMap.get(push.id) ?? `${prefix}-${push.id}`,
    })),
    exceptions: result.exceptions.map((exception) => ({
      ...exception,
      id: `${prefix}-${exception.id}`,
      pushId: exception.pushId ? pushIdMap.get(exception.pushId) ?? `${prefix}-${exception.pushId}` : exception.pushId,
    })),
  };
}

function operationLabel(operationType: OperationType) {
  return operationType === "mainline" ? "Mainline" : "Express";
}

export function filterScheduleResultByOperation(result: ScheduleResult, operationType: OperationView): ScheduleResult {
  if (operationType === "all") return result;

  const pushes = result.pushes
    .map((push) => {
      const flights = push.flights.filter((flight) => operationTypeForAircraft(flight.aircraft) === operationType);
      const flightIds = new Set(flights.map((flight) => flight.id));
      return {
        ...push,
        flights,
        serviceEvents: push.serviceEvents.filter((event) => flightIds.has(event.flightId)),
      };
    })
    .filter((push) => push.flights.length > 0);
  const pushIds = new Set(pushes.map((push) => push.id));
  const flightIds = new Set(pushes.flatMap((push) => push.flights.map((flight) => flight.id)));
  const exceptions = result.exceptions.filter((exception) => {
    if (exception.operationType) return exception.operationType === operationType;
    return (exception.pushId && pushIds.has(exception.pushId)) || (exception.flightId && flightIds.has(exception.flightId));
  });
  return buildResult(result.mode, pushes, exceptions, result.rules);
}

export function rejectCriticalPairings(result: ScheduleResult): ScheduleResult {
  const acceptedPushes: Push[] = [];
  const rejectedFlights: { push: Push; flight: Flight }[] = [];

  for (const push of result.pushes) {
    const evaluatedPush = applyRiskSeverity(push);
    if (evaluatedPush.riskSeverity !== "critical") {
      acceptedPushes.push(push);
      continue;
    }

    const criticalFlightIds = new Set(evaluatedPush.serviceEvents
      .filter((event) => event.riskSeverity === "critical")
      .map((event) => event.flightId));

    if (criticalFlightIds.size === 0) {
      for (const flight of push.flights) rejectedFlights.push({ push, flight });
      continue;
    }

    for (const flight of push.flights) {
      if (criticalFlightIds.has(flight.id)) rejectedFlights.push({ push, flight });
    }

    const keptFlights = push.flights.filter((flight) => !criticalFlightIds.has(flight.id));
    if (keptFlights.length > 0) {
      acceptedPushes.push({
        ...push,
        flights: keptFlights,
        serviceEvents: push.serviceEvents.filter((event) => !criticalFlightIds.has(event.flightId)),
        riskFlags: push.riskFlags.filter((flag) => riskSeverityForFlag(flag) !== "critical"),
        exceptionFlags: push.exceptionFlags.filter((flag) => riskSeverityForFlag(flag) !== "critical"),
      });
    }
  }

  const rejectedPushes = [...new Set(rejectedFlights.map((item) => item.push))];
  if (rejectedPushes.length === 0) return result;

  const existingExceptionIds = new Set(result.exceptions.map((exception) => exception.id));
  const criticalExceptions = rejectedFlights.map(({ push, flight }) => {
    const issue = criticalPairingIssue(push, flight.id);
    const id = `${push.id}-${flight.id}-critical-pairing`;
    return {
      id: existingExceptionIds.has(id) ? `${id}-rejected` : id,
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      operationType: flight.operationType,
      serviceType: flight.serviceType,
      pushId: push.id,
      issue,
      cause: issue.includes("aircraft type") ? "timing-conflict" as const : "delayed-flight-risk" as const,
      recommendedAction: issue.includes("aircraft type")
        ? "Add or correct the aircraft type, then rebuild the guidance before assigning this flight."
        : "Rebuild timing or add resources. The resource plan cannot publish a pairing that misses the hard cutoff.",
    };
  });

  return buildResult(result.mode, acceptedPushes, [...result.exceptions, ...criticalExceptions], result.rules);
}

export function rejectUnassignedPushes(result: ScheduleResult): ScheduleResult {
  const acceptedPushes: Push[] = [];
  const rejectedPushes: Push[] = [];

  for (const push of result.pushes) {
    if (push.driverId && push.truckId && push.helperId !== "needed") {
      acceptedPushes.push(push);
      continue;
    }

    rejectedPushes.push(push);
  }

  if (rejectedPushes.length === 0) return result;

  const existingExceptionIds = new Set(result.exceptions.map((exception) => exception.id));
  const coverageExceptions: ScheduleException[] = rejectedPushes.flatMap((push) => {
    const cause = unassignedPushCause(push);
    return push.flights.map((flight) => {
      const id = `${push.id}-${flight.id}-unassigned-resource`;
      return {
        id: existingExceptionIds.has(id) ? `${id}-rejected` : id,
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        operationType: flight.operationType,
        serviceType: flight.serviceType,
        pushId: push.id,
        issue: unassignedPushIssue(push, flight.flightNumber),
        cause,
        recommendedAction: unassignedPushAction(push),
      };
    });
  });

  return buildResult(result.mode, acceptedPushes, [...result.exceptions, ...coverageExceptions], result.rules);
}

function unassignedPushIssue(push: Push, flightNumber?: string) {
  const missing = [];
  if (!push.driverId) missing.push("driver");
  if (!push.truckId) missing.push("truck");
  if (push.helperId === "needed") missing.push("helper");
  const label = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Missing ${label} coverage${flightNumber ? ` for ${flightNumber}` : ""}`;
}

function unassignedPushAction(push: Push) {
  const missing = [];
  if (!push.driverId) missing.push("driver");
  if (!push.truckId) missing.push("truck");
  if (push.helperId === "needed") missing.push("helper");
  const label = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Do not publish this resource plan. Add ${label} coverage or adjust timing rules, then rebuild until no work remains open.`;
}

function unassignedPushCause(push: Push): ScheduleException["cause"] {
  if (!push.driverId) return "driver-shortage";
  if (!push.truckId) return "truck-shortage";
  return "helper-shortage";
}

export function enforceUrgentPairingLimit(result: ScheduleResult, urgentLimitPercent = 5): ScheduleResult {
  let current = result;
  let guard = 0;

  while (current.summary.totalPushes > 0 && urgentPercent(current) > urgentLimitPercent && guard < 500) {
    const candidate = selectUrgentRejectionCandidate(current.pushes);
    if (!candidate) break;
    current = rejectUrgentCandidate(current, candidate);
    guard += 1;
  }

  return current;
}

function urgentPercent(result: ScheduleResult) {
  return (result.summary.urgentPushes / result.summary.totalPushes) * 100;
}

type UrgentRejectionCandidate = {
  push: Push;
  rejectedFlightIds: Set<string>;
  score: number;
};

function selectUrgentRejectionCandidate(pushes: Push[]): UrgentRejectionCandidate | null {
  const candidates = pushes
    .map((push) => {
      const evaluatedPush = applyRiskSeverity(push);
      if (evaluatedPush.riskSeverity !== "urgent") return null;
      const rejectedFlightIds = urgentFlightIdsForPush(evaluatedPush);
      if (rejectedFlightIds.size === 0) return null;
      const rejectedFlights = evaluatedPush.flights.filter((flight) => rejectedFlightIds.has(flight.id));
      const rejectedOutboundCount = rejectedFlights.filter((flight) => !isInternationalStripFlight(flight)).length;
      const rejectedStripCount = rejectedFlights.filter(isInternationalStripFlight).length;
      const unassignedPenalty = evaluatedPush.driverId ? 0 : -50;
      const stripPreference = rejectedStripCount > 0 ? -100 : 0;
      return {
        push: evaluatedPush,
        rejectedFlightIds,
        score: stripPreference + rejectedOutboundCount * 100 + rejectedFlights.length * 10 + unassignedPenalty + timeToMinutes(evaluatedPush.kitchenDepartureTime) / 10000,
      };
    })
    .filter((candidate): candidate is UrgentRejectionCandidate => Boolean(candidate))
    .sort((a, b) => a.score - b.score);

  return candidates[0] ?? null;
}

function urgentFlightIdsForPush(push: Push) {
  const urgentEventIds = new Set(push.serviceEvents
    .filter((event) => event.riskSeverity === "urgent" || serviceRiskSeverity(event.riskStatus) === "urgent")
    .map((event) => event.flightId));

  if (urgentEventIds.size > 0) return urgentEventIds;

  if ([...push.riskFlags, ...push.exceptionFlags].some((flag) => riskSeverityForFlag(flag) === "urgent")) {
    return new Set(push.flights.map((flight) => flight.id));
  }

  return new Set<string>();
}

function rejectUrgentCandidate(result: ScheduleResult, candidate: UrgentRejectionCandidate): ScheduleResult {
  const acceptedPushes: Push[] = [];
  const rejectedFlights: { push: Push; flight: Flight }[] = [];

  for (const push of result.pushes) {
    if (push.id !== candidate.push.id) {
      acceptedPushes.push(push);
      continue;
    }

    for (const flight of push.flights) {
      if (candidate.rejectedFlightIds.has(flight.id)) rejectedFlights.push({ push, flight });
    }

    const keptFlights = push.flights.filter((flight) => !candidate.rejectedFlightIds.has(flight.id));
    if (keptFlights.length > 0) {
      acceptedPushes.push({
        ...push,
        flights: keptFlights,
        serviceEvents: push.serviceEvents.filter((event) => !candidate.rejectedFlightIds.has(event.flightId)),
        riskFlags: push.riskFlags.filter((flag) => riskSeverityForFlag(flag) !== "urgent"),
        exceptionFlags: push.exceptionFlags.filter((flag) => riskSeverityForFlag(flag) !== "urgent"),
      });
    }
  }

  if (rejectedFlights.length === 0) return result;

  const existingExceptionIds = new Set(result.exceptions.map((exception) => exception.id));
  const urgentExceptions: ScheduleException[] = rejectedFlights.map(({ push, flight }) => {
    const issue = urgentPairingIssue(push, flight.id);
    const id = `${push.id}-${flight.id}-urgent-pairing`;
    return {
      id: existingExceptionIds.has(id) ? `${id}-rejected` : id,
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      operationType: flight.operationType,
      serviceType: flight.serviceType,
      pushId: push.id,
      issue,
      cause: issue.includes("Shift exceeds") ? "timing-conflict" : "food-safety-window",
      recommendedAction: "Separate this work, adjust timing, or add capacity. This plan cannot publish urgent pairings.",
    };
  });

  return buildResult(result.mode, acceptedPushes, [...result.exceptions, ...urgentExceptions], result.rules);
}

function urgentPairingIssue(push: Push, flightId: string) {
  const event = push.serviceEvents.find((item) => item.flightId === flightId);
  if (event?.riskStatus === "urgent-risk") return `${event.flightNumber} is inside the 0-5 minute hard cutoff margin`;
  const urgentFlag = [...push.riskFlags, ...push.exceptionFlags].find((flag) => riskSeverityForFlag(flag) === "urgent");
  return urgentFlag ?? "Urgent pairing rejected by resource-plan quality gate";
}

function criticalPairingIssue(push: Push, flightId: string) {
  const event = push.serviceEvents.find((item) => item.flightId === flightId);
  if (event?.riskStatus === "unknown-aircraft") return `${event.flightNumber} needs an aircraft type before this plan is trusted`;
  if (event?.riskStatus === "late-risk") return `${event.flightNumber} would miss the hard completion cutoff`;
  const criticalFlag = [...push.riskFlags, ...push.exceptionFlags].find((flag) => riskSeverityForFlag(flag) === "critical");
  return criticalFlag ?? "Critical pairing rejected by resource plan";
}

function operationTypeForAircraft(aircraft: string): OperationType {
  return categoryForAircraft(aircraft) === "regional" ? "express" : "mainline";
}

export function createDispatchSchedule(assignments: FlightAssignment[], drivers: Driver[], helpers: Helper[], trucks: Truck[], resources: ResourceInputs, options: ScheduleOptions = {}): ScheduleResult {
  const rules = options.rules ?? planningRules;
  const flights = toFlights(assignments, rules, options.operationType);
  const candidatePushes = optimizePairings(buildCandidatePucks(flights, rules), rules);
  const exceptions: ScheduleException[] = [];
  const scheduledPushes = assignLimitedResources(candidatePushes, drivers.slice(0, resources.availableDrivers), helpers.slice(0, resources.availableHelpers), selectAvailableTrucks(trucks, resources.availableTrucks), exceptions, rules);
  return buildResult("dispatch", scheduledPushes, exceptions, rules);
}

function toFlights(assignments: FlightAssignment[], rules: PlanningRules, operationType?: OperationType): Flight[] {
  const outboundFlights = assignments
    .filter((flight) => flight.serviceType !== "break")
    .map((flight) => {
      const etdMinutes = timeToMinutes(flight.etd);
      const aircraftCategory = categoryForAircraft(flight.aircraft);
      const flightOperationType: OperationType = operationTypeForAircraft(flight.aircraft);
      const serviceMinutes = serviceMinutesForAircraft(flight.aircraft, aircraftCategory, rules);
      const preferredOnMinutes = preferredOnMinutesBeforeDeparture(flight.aircraft, aircraftCategory);
      const preferredOffMinutes = preferredOnMinutes - serviceMinutes;
      const hardOffMinutes = hardOffMinutesBeforeDeparture(flight.destinationAirport, rules);
      const stripServiceStartMinutes = internationalStripServiceStartMinutes(flight);
      const loadWindowStart = stripServiceStartMinutes !== undefined
        ? minutesToTime(stripServiceStartMinutes)
        : minutesToTime(etdMinutes - rules.earliestCateringBeforeDepartureMinutes);
      const loadWindowEnd = stripServiceStartMinutes !== undefined
        ? minutesToTime(stripServiceStartMinutes + serviceMinutes)
        : minutesToTime(etdMinutes - preferredOffMinutes);
      const hardLatestCompletion = stripServiceStartMinutes !== undefined
        ? minutesToTime(stripServiceStartMinutes + serviceMinutes)
        : minutesToTime(etdMinutes - hardOffMinutes);
      return {
        id: flight.id,
        flightNumber: flight.flightNumber,
        gate: flight.gate,
        etd: flight.etd,
        eta: flight.eta,
        inboundEta: flight.inboundEta,
        aircraft: flight.aircraft,
        serviceType: flight.serviceType,
        aircraftCategory,
        operationType: flightOperationType,
      originAirport: flight.originAirport,
        destinationAirport: flight.destinationAirport,
        loadWindowStart,
        loadWindowEnd,
        hardLatestCompletion,
        workloadUnits: workloadFor(flight.serviceType, aircraftCategory),
      };
    });

  return [...outboundFlights, ...createInternationalStripFlights(outboundFlights, rules)]
    .filter((flight) => !operationType || flight.operationType === operationType)
    .sort((a, b) => timeToMinutes(a.etd) - timeToMinutes(b.etd));
}

const internationalStripOffsetMinutes = 240;

function createInternationalStripFlights(outboundFlights: Flight[], rules: PlanningRules): Flight[] {
  return outboundFlights
    .filter((flight) => isInternationalDestination(flight.destinationAirport))
    .map((flight): Flight => {
      const stripStartMinutes = validTime(flight.inboundEta)
        ? timeToMinutes(flight.inboundEta) + internationalStripCustomsClearanceMinutes
        : Math.max(0, timeToMinutes(flight.etd) - internationalStripOffsetMinutes);
      const stripDuration = serviceMinutesForAircraft(flight.aircraft, flight.aircraftCategory, rules);
      const stripEndMinutes = stripStartMinutes + stripDuration;
      return {
        ...flight,
        id: `${flight.id}-intl-strip`,
        flightNumber: `INTL STRIP ${flight.flightNumber}`,
        etd: minutesToTime(stripStartMinutes),
        serviceType: "intl-strip",
        operationType: "mainline",
        loadWindowStart: minutesToTime(stripStartMinutes),
        loadWindowEnd: minutesToTime(stripEndMinutes),
        hardLatestCompletion: minutesToTime(stripEndMinutes),
        workloadUnits: workloadFor("intl-strip", flight.aircraftCategory),
      };
    });
}

function buildCandidatePucks(flights: Flight[], rules: PlanningRules): Push[] {
  return flights.map((flight, index) => createPush(index + 1, [flight], rules, "Standalone candidate puck."));
}

function optimizePairings(candidatePucks: Push[], rules: PlanningRules, pairingStrategy?: PairingStrategy): Push[] {
  const flights = candidatePucks.flatMap((puck) => puck.flights).sort((a, b) => timeToMinutes(a.hardLatestCompletion) - timeToMinutes(b.hardLatestCompletion));
  const pushes: Push[] = [];
  const assigned = new Set<string>();

  for (const flight of flights) {
    if (assigned.has(flight.id)) continue;

    let current = [flight];
    assigned.add(flight.id);

    while (current.length < maxFlightsForPairing(current, rules, pairingStrategy)) {
      const next = findBestNextFlight(current, flights, assigned, rules, pairingStrategy);
      if (!next) break;
      current = sortRoute([...current, next]);
      assigned.add(next.id);
    }

    pushes.push(createPush(pushes.length + 1, current, rules, explainPairing(current)));
  }

  return pushes;
}

function findBestNextFlight(current: Flight[], flights: Flight[], assigned: Set<string>, rules: PlanningRules, pairingStrategy?: PairingStrategy) {
  let best: { flight: Flight; score: number } | null = null;
  for (const flight of flights) {
    if (assigned.has(flight.id) || !compatibleWithPairing(current, flight, rules, pairingStrategy)) continue;
    const candidate = sortRoute([...current, flight]);
    const evaluation = evaluateRoute(candidate, rules);
    if (!evaluation.isFeasible) continue;
    if (pairingStrategy?.allowUrgentPairings === false && hasUrgentOrCriticalRisk(evaluation)) continue;
    const gap = Math.max(...candidate.map((item) => timeToMinutes(item.etd))) - Math.min(...candidate.map((item) => timeToMinutes(item.etd)));
    const regionalBonus = candidate.every((item) => item.aircraftCategory === "regional") ? 40 : 0;
    const threeFlightBonus = pairingStrategy?.targetThreeFlightPairingPercent
      ? threeFlightPairingBonus(candidate, flights, assigned, rules, pairingStrategy)
      : 0;
    const score = 300 - gap + regionalBonus + candidate.length * 25 + threeFlightBonus - evaluation.idleMinutes;
    if (!best || score > best.score) best = { flight, score };
  }
  return best?.flight ?? null;
}

function threeFlightPairingBonus(candidate: Flight[], flights: Flight[], assigned: Set<string>, rules: PlanningRules, pairingStrategy: PairingStrategy) {
  if (candidate.length >= 3) return pairingStrategy.targetThreeFlightPairingPercent * 100;
  if (candidate.length !== 2) return 0;

  const canReachThree = flights.some((flight) => {
    if (assigned.has(flight.id) || candidate.some((item) => item.id === flight.id)) return false;
    const threeFlightCandidate = sortRoute([...candidate, flight]);
    const evaluation = evaluateRoute(threeFlightCandidate, rules);
    return compatibleWithPairing(candidate, flight, rules, pairingStrategy)
      && evaluation.isFeasible
      && (pairingStrategy.allowUrgentPairings !== false || !hasUrgentOrCriticalRisk(evaluation));
  });

  return canReachThree ? pairingStrategy.targetThreeFlightPairingPercent * 15 : 0;
}

function compatibleWithPairing(current: Flight[], next: Flight, rules: PlanningRules, pairingStrategy?: PairingStrategy) {
  const candidate = [...current, next];
  const categories = new Set(candidate.map((flight) => flight.aircraftCategory));
  if (categories.has("unknown")) return false;
  if (candidate.some(isInternationalStripFlight)) return candidate.length === 1;
  if (candidate.some(isWidebodyStripFlight)) return candidate.length === 1;
  if (categories.has("regional") && categories.size > 1) return false;
  if (categories.has("widebody")) return candidate.length === 1;
  if (candidate.length > maxFlightsForPairing(candidate, rules, pairingStrategy)) return false;
  if (mixesUnitedWithOtherAirlinesAtRestrictedSite(candidate, rules)) return false;

  const firstEtd = Math.min(...candidate.map((flight) => timeToMinutes(flight.etd)));
  const lastEtd = Math.max(...candidate.map((flight) => timeToMinutes(flight.etd)));
  const workload = candidate.reduce((total, flight) => total + flight.workloadUnits, 0);
  const siteOverride = sharedSiteRules(candidate, rules);
  const groupWindowMinutes = siteOverride?.groupWindowMinutes ?? rules.groupWindowMinutes;
  const maxWorkloadUnits = siteOverride?.maxWorkloadUnitsPerPush ?? rules.maxWorkloadUnitsPerPush;
  return lastEtd - firstEtd <= groupWindowMinutes && workload <= maxWorkloadUnits;
}

function hasUrgentOrCriticalRisk(evaluation: ReturnType<typeof evaluateRoute>) {
  return evaluation.serviceEvents.some((event) => event.riskSeverity === "urgent" || event.riskSeverity === "critical");
}

function mixesUnitedWithOtherAirlinesAtRestrictedSite(flights: Flight[], rules: PlanningRules) {
  const restrictedFlights = flights.filter((flight) => siteRules(rules, flight.originAirport).separateUnitedAndOtherAirlines);
  if (restrictedFlights.length < 2) return false;
  return restrictedFlights.some(isUnitedFlight) && restrictedFlights.some((flight) => !isUnitedFlight(flight));
}

function isUnitedFlight(flight: Flight) {
  return flight.serviceType === "load-ua" || /^UA/i.test(baseFlightNumber(flight.flightNumber));
}

function baseFlightNumber(flightNumber: string) {
  return flightNumber.replace(/^INTL STRIP\s+/i, "").trim();
}

function maxFlightsForPairing(flights: Flight[], rules: PlanningRules, pairingStrategy?: PairingStrategy) {
  if (flights.some(isInternationalStripFlight)) return 1;
  if (flights.some(isWidebodyStripFlight)) return 1;
  if (flights.some((flight) => flight.aircraftCategory === "unknown" || flight.aircraftCategory === "widebody")) return 1;
  const siteOverride = sharedSiteRules(flights, rules);
  const threeFlightTargetIsActive = (pairingStrategy?.targetThreeFlightPairingPercent ?? 0) > 0;
  const configuredMaxFlights = Math.min(rules.maxFlightsPerPush, siteOverride?.maxFlightsPerPush ?? rules.maxFlightsPerPush);
  if (flights.every((flight) => flight.aircraftCategory === "regional")) return Math.min(configuredMaxFlights, threeFlightTargetIsActive ? 3 : 5);
  return Math.min(configuredMaxFlights, threeFlightTargetIsActive ? 3 : 2);
}

function sortRoute(flights: Flight[]) {
  return [...flights].sort((a, b) => timeToMinutes(a.loadWindowEnd) - timeToMinutes(b.loadWindowEnd));
}

function createPush(pushNumber: number, flights: Flight[], rules: PlanningRules, explanation: string): Push {
  const evaluation = evaluateRoute(flights, rules);
  const needsHelper = rules.helperRequiredForMainline;
  const aircraftCategory = commonAircraftCategory(flights);

  return {
    id: `P${String(pushNumber).padStart(3, "0")}`,
    driverId: null,
    helperId: needsHelper ? "needed" : null,
    truckId: null,
    flights,
    aircraftCategory,
    loadStartTime: minutesToTime(evaluation.loadStart),
    loadEndTime: minutesToTime(evaluation.kitchenDeparture),
    loadDurationMinutes: evaluation.loadDurationMinutes,
    kitchenDepartureTime: minutesToTime(evaluation.kitchenDeparture),
    gateServiceTime: minutesToTime(evaluation.arriveFirstGate),
    arriveFirstGateTime: minutesToTime(evaluation.arriveFirstGate),
    serviceEvents: evaluation.serviceEvents,
    returnTime: minutesToTime(evaluation.returnKitchen),
    totalDurationMinutes: evaluation.returnKitchen + kitchenUnloadMinutes - evaluation.kitchenDeparture,
    utilizationMinutes: evaluation.utilizationMinutes + kitchenUnloadMinutes,
    idleMinutes: evaluation.idleMinutes,
    isFeasible: evaluation.isFeasible,
    riskFlags: evaluation.riskFlags,
    riskSeverity: "normal",
    pairingScore: evaluation.score,
    explanation,
    exceptionFlags: [...evaluation.riskFlags],
  };
}

function evaluateRoute(flights: Flight[], rules: PlanningRules) {
  const sortedFlights = sortRoute(flights);
  const driveOutMinutes = driveMinutesForSite(sortedFlights[0]?.originAirport, rules);
  const returnMinutes = returnMinutesForSite(sortedFlights[0]?.originAirport, rules);
  const outboundSealBreakMinutes = sealBreakMinutesForSite(sortedFlights[0]?.originAirport, rules);
  const outboundDriveAndSealMinutes = driveOutMinutes + outboundSealBreakMinutes;
  const gateMoveMinutes = gateMoveMinutesForSite(sortedFlights[0]?.originAirport, rules);
  const serviceDurations = sortedFlights.map((flight) => serviceMinutesForFlight(flight, rules));
  const earliestAllowedKitchenDeparture = earliestAllowedKitchenDepartureForPush(sortedFlights, rules);
  const latestStarts = new Array<number>(sortedFlights.length);
  const riskFlags: string[] = [];

  for (let index = sortedFlights.length - 1; index >= 0; index -= 1) {
    const flight = sortedFlights[index];
    const targetLatestCompletion = Math.min(timeToMinutes(flight.loadWindowEnd), timeToMinutes(flight.hardLatestCompletion) - rules.hardMinimumCompletionBeforeDepartureMinutes);
    const targetLatestStart = targetLatestCompletion - serviceDurations[index];
    const nextLatestStart = index === sortedFlights.length - 1
      ? Number.POSITIVE_INFINITY
      : latestStarts[index + 1] - gateMoveMinutes - serviceDurations[index];
    latestStarts[index] = Math.min(targetLatestStart, nextLatestStart);
  }

  const earliestFirstServiceStart = snapUp(earliestAllowedKitchenDeparture, rules) + outboundDriveAndSealMinutes;
  let currentStart = Math.max(latestStarts[0], earliestFirstServiceStart);
  const serviceEvents: ServiceEvent[] = [];
  let utilizationMinutes = outboundDriveAndSealMinutes + returnMinutes;
  let idleMinutes = 0;
  let isFeasible = true;

  sortedFlights.forEach((flight, index) => {
    const earliestStart = earliestServiceStart(flight, rules);
    if (index > 0) {
      currentStart += gateMoveMinutes;
      utilizationMinutes += gateMoveMinutes;
    }
    if (currentStart < earliestStart) {
      idleMinutes += earliestStart - currentStart;
      currentStart = earliestStart;
    }

    const duration = serviceDurations[index];
    const serviceEnd = currentStart + duration;
    utilizationMinutes += duration;
    const hardEnd = timeToMinutes(flight.hardLatestCompletion);
    const hardMarginMinutes = hardEnd - serviceEnd;
    const riskStatus = flight.aircraftCategory === "unknown"
      ? "unknown-aircraft"
      : hardMarginMinutes < 0
        ? "late-risk"
        : isInternationalStripFlight(flight)
          ? "normal"
          : hardMarginMinutes <= 5
            ? "urgent-risk"
            : hardMarginMinutes <= 10
              ? "watch"
              : "normal";

    if (currentStart < earliestStart || serviceEnd > hardEnd) isFeasible = false;
    if (riskStatus === "late-risk") riskFlags.push(`${flight.flightNumber} hardMargin = ${hardMarginMinutes}m`);
    if (riskStatus === "urgent-risk") riskFlags.push(`${flight.flightNumber} hardMargin = ${hardMarginMinutes}m`);
    if (riskStatus === "watch") riskFlags.push(`${flight.flightNumber} hardMargin = ${hardMarginMinutes}m`);
    if (riskStatus === "unknown-aircraft") riskFlags.push(`${flight.flightNumber} needs an aircraft type before this plan is trusted`);

    serviceEvents.push({
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      gate: flight.gate,
      aircraftType: flight.aircraft,
      destinationAirport: flight.destinationAirport,
      departureTime: flight.etd,
      aircraftArrivalTime: flight.inboundEta,
      serviceStart: minutesToTime(currentStart),
      serviceEnd: minutesToTime(serviceEnd),
      serviceDurationMinutes: duration,
      riskStatus,
      riskSeverity: serviceRiskSeverity(riskStatus),
    });

    currentStart = serviceEnd;
  });

  const firstFlight = sortedFlights[0];
  const stripArrivalTarget = firstFlight && isInternationalStripFlight(firstFlight) && validTime(firstFlight.inboundEta)
    ? timeToMinutes(firstFlight.inboundEta) - internationalStripArrivalWaitBeforeMinutes
    : undefined;
  const rawKitchenDeparture = stripArrivalTarget !== undefined
    ? stripArrivalTarget - driveOutMinutes
    : timeToMinutes(serviceEvents[0]?.serviceStart ?? "00:00") - outboundDriveAndSealMinutes;
  const kitchenDeparture = Math.max(stripArrivalTarget !== undefined ? rawKitchenDeparture : snapDown(rawKitchenDeparture, rules), earliestAllowedKitchenDeparture);
  const loadStart = Math.max(0, kitchenDeparture - rules.firstAircraftSetupMinutes);
  const loadDurationMinutes = kitchenDeparture - loadStart;
  const arriveFirstGate = kitchenDeparture + driveOutMinutes;
  const finalServiceEnd = currentStart;
  const maxDockDepartureToFinalServiceEnd = maxDockDepartureToFinalServiceEndMinutesForSite(sortedFlights[0]?.originAirport, rules);
  const dockDepartureToFinalServiceEnd = finalServiceEnd - kitchenDeparture;
  if (maxDockDepartureToFinalServiceEnd !== undefined && dockDepartureToFinalServiceEnd > maxDockDepartureToFinalServiceEnd) {
    isFeasible = false;
    riskFlags.push(`Dock-to-final-catering = ${dockDepartureToFinalServiceEnd}m exceeds ${maxDockDepartureToFinalServiceEnd}m`);
  }
  const returnKitchen = currentStart + returnMinutes;
  const pairingPenalty = sortedFlights.length === 1 && sortedFlights[0]?.aircraftCategory === "regional" ? 35 : 0;
  const score = sortedFlights.length * 100 - idleMinutes - riskFlags.length * 50 - pairingPenalty;

  if (kitchenDeparture < 0) isFeasible = false;

  return {
    kitchenDeparture: Math.max(0, kitchenDeparture),
    loadStart,
    loadDurationMinutes,
    arriveFirstGate: Math.max(0, arriveFirstGate),
    returnKitchen,
    serviceEvents,
    utilizationMinutes,
    idleMinutes,
    isFeasible,
    riskFlags: [...new Set(riskFlags)],
    score,
  };
}

function earliestServiceStart(flight: Flight, rules: PlanningRules) {
  if (isInternationalStripFlight(flight)) return timeToMinutes(flight.loadWindowStart);
  const windowStart = timeToMinutes(flight.loadWindowStart);
  const inboundReady = validTime(flight.inboundEta) ? timeToMinutes(flight.inboundEta) + 10 : windowStart;
  if (flight.aircraftCategory === "regional") return Math.max(inboundReady, timeToMinutes(flight.etd) - rules.earliestCateringBeforeDepartureMinutes);
  return Math.max(windowStart, inboundReady);
}

const internationalStripArrivalWaitBeforeMinutes = 15;
const internationalStripCustomsClearanceMinutes = 15;

function internationalStripServiceStartMinutes(flight: FlightAssignment) {
  if (flight.serviceType !== "intl-strip" || !validTime(flight.inboundEta)) return undefined;
  return timeToMinutes(flight.inboundEta) + internationalStripCustomsClearanceMinutes;
}

function earliestAllowedKitchenDepartureForPush(flights: Flight[], rules: PlanningRules) {
  if (flights.length === 0) return 0;
  return Math.max(...flights.map((flight) => timeToMinutes(flight.etd) - rules.maxKitchenDepartureBeforeDepartureMinutes));
}

function serviceMinutesForFlight(flight: Flight, rules: PlanningRules) {
  if (isInternationalStripFlight(flight)) return serviceMinutesForAircraft(flight.aircraft, flight.aircraftCategory, rules);
  return serviceMinutesForAircraft(flight.aircraft, flight.aircraftCategory, rules);
}

function serviceMinutesForAircraft(aircraft: string, aircraftCategory: AircraftCategory, rules: PlanningRules) {
  if (is757Aircraft(aircraft)) return 40;
  return rules.serviceMinutesByAircraftCategory[aircraftCategory];
}

function preferredOnMinutesBeforeDeparture(aircraft: string, aircraftCategory: AircraftCategory) {
  if (aircraftCategory === "regional") return 40;
  if (is757Aircraft(aircraft)) return 65;
  if (aircraftCategory === "widebody") return 90;
  if (aircraftCategory === "narrowbody") return 50;
  return 90;
}

function hardOffMinutesBeforeDeparture(destinationAirport: string | undefined, rules: PlanningRules) {
  return isInternationalDestination(destinationAirport) ? 30 : rules.hardMinimumCompletionBeforeDepartureMinutes;
}

function driveMinutesForSite(originAirport: Flight["originAirport"], rules: PlanningRules) {
  return siteRules(rules, originAirport).driveOutMinutes ?? rules.mainlineDriveOutMinutes;
}

function returnMinutesForSite(originAirport: Flight["originAirport"], rules: PlanningRules) {
  return siteRules(rules, originAirport).returnMinutes ?? driveMinutesForSite(originAirport, rules);
}

function sealBreakMinutesForSite(originAirport: Flight["originAirport"], rules: PlanningRules) {
  return siteRules(rules, originAirport).sealBreakMinutes ?? 0;
}

function gateMoveMinutesForSite(originAirport: Flight["originAirport"], rules: PlanningRules) {
  return siteRules(rules, originAirport).gateToGateMoveMinutes ?? rules.gateToGateMoveMinutes;
}

function maxDockDepartureToFinalServiceEndMinutesForSite(originAirport: Flight["originAirport"], rules: PlanningRules) {
  return siteRules(rules, originAirport).maxDockDepartureToFinalServiceEndMinutes
    ?? rules.earliestCateringBeforeDepartureMinutes - rules.firstAircraftSetupMinutes;
}

function explainPairing(flights: Flight[]) {
  if (flights.length === 1) {
    const [flight] = flights;
    if (flight.aircraftCategory === "widebody") return `${flight.flightNumber} is standalone because widebody pushes are protected from risky bundling.`;
    if (flight.aircraftCategory === "unknown") return `${flight.flightNumber} is standalone because the aircraft type is missing or unrecognized. Update the aircraft type before trusting this pairing.`;
    if (flight.aircraftCategory === "regional") return `${flight.flightNumber} is standalone because no compatible regional flight fit the timing window.`;
    return `${flight.flightNumber} is standalone because no compatible flight fit the load window without creating timing risk.`;
  }

  const flightNames = flights.map((flight) => flight.flightNumber).join(" and ");
  const category = commonAircraftCategory(flights);
  if (category === "regional") return `${flightNames} paired because they are regional flights, stay within the practical gate window, and avoid isolated regional pushes.`;
  return `${flightNames} paired because the flights are compatible, fit the food-safety timing window, and stay within truck workload capacity.`;
}

function commonAircraftCategory(flights: Flight[]): AircraftCategory {
  const categories = [...new Set(flights.map((flight) => flight.aircraftCategory))];
  return categories.length === 1 ? categories[0] : "narrowbody";
}

function assignUnlimitedResources(pushes: Push[], drivers: Driver[], helpers: Helper[], trucks: Truck[], rules: PlanningRules, pairingStrategy?: PairingStrategy) {
  const allowSiteShiftStretch = pairingStrategy?.allowUrgentPairings !== false
    && pushes.length > 0
    && pushes.every((push) => push.flights.every((flight) => siteRules(rules, flight.originAirport).allowShiftStretch));
  const attempts = [
    assignPushes(pushes, createDriverPool(drivers), createHelperPool(helpers), createTruckPool(trucks), [], rules, allowSiteShiftStretch, byDeparture),
    assignPushes(pushes, createDriverPool(drivers), createHelperPool(helpers), createTruckPool(trucks), [], rules, allowSiteShiftStretch, byLatestCompletion),
    assignPushes(pushes, createDriverPool(drivers), createHelperPool(helpers), createTruckPool(trucks), [], rules, allowSiteShiftStretch, byLongestDuration),
  ];
  return [...attempts.sort((a, b) => assignmentScore(a, rules) - assignmentScore(b, rules))[0]].sort(byDeparture);
}

function assignLimitedResources(pushes: Push[], drivers: Driver[], helpers: Helper[], trucks: Truck[], exceptions: ScheduleException[], rules: PlanningRules) {
  return assignPushes(pushes, createDriverPool(drivers), createHelperPool(helpers), createTruckPool(trucks), exceptions, rules, true, byDeparture);
}

function assignPushes(pushes: Push[], driverPool: ResourcePoolItem[], helperPool: ResourcePoolItem[], truckPool: ResourcePoolItem[], exceptions: ScheduleException[], rules: PlanningRules, allowShiftOverflow: boolean, sortPushes: (a: Push, b: Push) => number) {
  return [...pushes]
    .sort(sortPushes)
    .map((push) => assignResourcesToPush(push, driverPool, helperPool, truckPool, exceptions, rules, allowShiftOverflow));
}

function assignResourcesToPush(push: Push, driverPool: ResourcePoolItem[], helperPool: ResourcePoolItem[], truckPool: ResourcePoolItem[], exceptions: ScheduleException[], rules: PlanningRules, allowShiftOverflow: boolean): Push {
  const originalResourceStart = timeToMinutes(push.loadStartTime);
  const originalReturn = timeToMinutes(push.returnTime);
  const originalDriverTruckRelease = originalReturn + kitchenUnloadMinutes;
  const truckCount = requiredTruckCount(push);
  const trucks = bestTrucksForPush(truckPool, originalResourceStart, truckCount, push);
  let drivers = bestShiftResources(driverPool, originalResourceStart, originalDriverTruckRelease, truckCount, rules, allowShiftOverflow, push);
  const helperNeeded = helpersRequiredForPush(push, trucks, rules);
  let helpers = helperNeeded ? bestShiftResources(helperPool, originalResourceStart, originalReturn, truckCount, rules, allowShiftOverflow, push) : [];
  const assignedPush = { ...push, exceptionFlags: [...push.exceptionFlags] };

  const latestDriverReadyTime = drivers.length > 0 ? Math.max(...drivers.map((driver) => driver.availableAt)) : originalResourceStart;
  const latestTruckReadyTime = trucks.length > 0 ? Math.max(...trucks.map((truck) => truck.availableAt)) : originalResourceStart;
  const latestHelperReadyTime = helpers.length > 0 ? Math.max(...helpers.map((helper) => helper.availableAt)) : originalResourceStart;
  const resourceReadyTime = Math.max(latestDriverReadyTime, latestTruckReadyTime, helperNeeded ? latestHelperReadyTime : originalResourceStart);
  const rawResourceStart = Math.max(originalResourceStart, resourceReadyTime);
  const actualResourceStart = push.flights.some(isInternationalStripFlight) ? rawResourceStart : snapUp(rawResourceStart, rules);
  const delay = actualResourceStart - originalResourceStart;
  if (delay > 0) shiftPush(assignedPush, delay);

  const assignedResourceStart = timeToMinutes(assignedPush.loadStartTime);
  const assignedReturn = timeToMinutes(assignedPush.returnTime);
  const assignedDriverTruckRelease = resourceReleaseTimeForPush(assignedPush);
  if (!crewSelectionPreservesLunch(drivers, assignedResourceStart, assignedDriverTruckRelease, rules, assignedPush)) {
    drivers = bestShiftResources(driverPool, assignedResourceStart, assignedDriverTruckRelease, truckCount, rules, allowShiftOverflow, assignedPush);
  }
  if (helperNeeded && !crewSelectionPreservesLunch(helpers, assignedResourceStart, assignedReturn, rules, assignedPush)) {
    helpers = bestShiftResources(helperPool, assignedResourceStart, assignedReturn, truckCount, rules, allowShiftOverflow, assignedPush);
  }

  if (drivers.length < truckCount) markException(assignedPush, exceptions, "Driver coverage short", "driver-shortage", "Add one driver for each truck assigned to this push.");
  if (trucks.length < truckCount) markException(assignedPush, exceptions, truckShortageIssue(push, truckCount), "truck-shortage", truckShortageAction(push, truckCount));
  if (helperNeeded && helpers.length < truckCount) markException(assignedPush, exceptions, "Helper coverage short", "helper-shortage", "Assign one helper for each truck assigned to this push.");

  for (const event of assignedPush.serviceEvents) {
    const flight = assignedPush.flights.find((item) => item.id === event.flightId);
    if (!flight) continue;
    const serviceEnd = timeToMinutes(event.serviceEnd);
    const hardLatestCompletion = timeToMinutes(flight.hardLatestCompletion);
    const hardMarginMinutes = hardLatestCompletion - serviceEnd;
    if (hardMarginMinutes < 0) {
      markFlightException(assignedPush, flight, exceptions, `${flight.flightNumber} hardMargin = ${hardMarginMinutes}m`, "delayed-flight-risk", "Add resources or rebuild this push. Do not choose a plan that delays a flight.");
    } else if (!isInternationalStripFlight(flight) && hardMarginMinutes <= 10) {
      markFlightException(assignedPush, flight, exceptions, `${flight.flightNumber} hardMargin = ${hardMarginMinutes}m`, "food-safety-window", "Operationally possible, but within 10 minutes of the hard completion cutoff.");
    }
  }

  if (drivers.length >= truckCount) assignCrewPoolItems(drivers, assignedResourceStart, assignedDriverTruckRelease, assignedPush, "driverId", rules);
  if (trucks.length >= truckCount) assignTruckPoolItems(trucks, assignedResourceStart, assignedDriverTruckRelease, assignedPush);
  if (helperNeeded && helpers.length >= truckCount) assignCrewPoolItems(helpers, assignedResourceStart, assignedReturn, assignedPush, "helperId", rules);
  else if (!helperNeeded) { assignedPush.helperId = null; }
  return assignedPush;
}

function resourceReleaseTimeForPush(push: Push) {
  return timeToMinutes(push.returnTime) + kitchenUnloadMinutes;
}

function createDriverPool(drivers: Driver[]) { return drivers.map((driver) => createShiftPoolItem(driver.id, driver.shiftStart, driver.shiftEnd)); }
function createHelperPool(helpers: Helper[]) { return helpers.map((helper) => createShiftPoolItem(helper.id, helper.shiftStart, helper.shiftEnd)); }
function createTruckPool(trucks: Truck[]) { return trucks.map((truck) => ({ id: truck.truckNumber, availableAt: 0, assignedCount: 0, vehicleType: truck.vehicleType, assignments: [] })); }

function selectAvailableTrucks(trucks: Truck[], count: number) {
  return [...trucks]
    .sort((a, b) => truckFleetPriority(a) - truckFleetPriority(b))
    .slice(0, count);
}

function truckFleetPriority(truck: Truck) {
  if (truck.vehicleType === "22 Ft. Truck") return 0;
  if (truck.vehicleType === "16 Ft. Truck") return 1;
  if (truck.vehicleType === "14 Ft. SOV XL") return 2;
  if (truck.vehicleType === "10 Ft. SOV") return 3;
  return 4;
}

function createShiftPoolItem(id: string, shiftStart: string, shiftEnd: string): ResourcePoolItem {
  const start = timeToMinutes(shiftStart);
  const end = timeToMinutes(shiftEnd);
  return {
    id,
    shiftStart: start,
    shiftEnd: end,
    availableAt: start,
    assignedCount: 0,
    assignments: [],
  };
}

function bestShiftResource(pool: ResourcePoolItem[], departure: number, returnTime: number, rules: PlanningRules, allowShiftOverflow: boolean, push: Push) {
  if (allowShiftOverflow) {
    const reusable = pool
      .filter((item) => item.availableAt <= departure && fitsAggressivePdxShift(item, returnTime) && preservesOperationalBreak(item, departure, returnTime, rules, push))
      .sort((a, b) => compareShiftResources(a, b, departure, rules, push));

    if (reusable.length > 0) return reusable[0];
  }

  const feasible = pool
    .filter((item) => item.availableAt <= departure && fitsStandardShift(item, departure, returnTime, rules) && preservesOperationalBreak(item, departure, returnTime, rules, push))
    .sort((a, b) => compareShiftResources(a, b, departure, rules, push));

  if (feasible.length > 0) return feasible[0];
  return allowShiftOverflow ? bestReusableResource(pool, departure, returnTime, rules, push) : undefined;
}

function fitsAggressivePdxShift(item: ResourcePoolItem, returnTime: number) {
  const pdxShiftStretchMinutes = 75;
  if (item.shiftEnd === undefined) return true;
  return returnTime <= item.shiftEnd + pdxShiftStretchMinutes;
}

function bestShiftResources(pool: ResourcePoolItem[], departure: number, returnTime: number, count: number, rules: PlanningRules, allowShiftOverflow: boolean, push: Push) {
  const selected: ResourcePoolItem[] = [];
  const available = [...pool];

  while (selected.length < count && available.length > 0) {
    const next = bestShiftResource(available, departure, returnTime, rules, allowShiftOverflow, push);
    if (!next) break;
    selected.push(next);
    available.splice(available.indexOf(next), 1);
  }

  return selected;
}

function bestReusableResource(pool: ResourcePoolItem[], departure: number, returnTime: number, rules: PlanningRules, push: Push) {
  const ready = pool
    .filter((item) => item.availableAt <= departure && preservesOperationalBreak(item, departure, returnTime, rules, push))
    .sort((a, b) => compareShiftResources(a, b, departure, rules, push));

  if (ready.length > 0) return ready[0];
  return undefined;
}

function compareShiftResources(a: ResourcePoolItem, b: ResourcePoolItem, departure: number, rules: PlanningRules, push?: Push) {
  const scoreDelta = shiftResourceScore(b, departure, rules, push) - shiftResourceScore(a, departure, rules, push);
  if (scoreDelta !== 0) return scoreDelta;
  return b.availableAt - a.availableAt;
}

function shiftResourceScore(item: ResourcePoolItem, departure: number, rules: PlanningRules, push?: Push) {
  const siteOverride = push ? sharedSiteRules(push.flights, rules) : undefined;
  const preferredReuseWindowMinutes = siteOverride?.preferredReuseWindowMinutes ?? 255;
  const lateWavePenaltyPerMinute = siteOverride?.lateWavePenaltyPerMinute ?? 2;
  const shiftStart = item.shiftStart ?? 0;
  const minutesIntoShift = departure - shiftStart;
  const lateWavePenalty = Math.max(0, minutesIntoShift - preferredReuseWindowMinutes) * lateWavePenaltyPerMinute;
  return item.assignedCount * 100 - lateWavePenalty + shiftStart / 10000;
}

function crewSelectionPreservesLunch(items: ResourcePoolItem[], departure: number, returnTime: number, rules: PlanningRules, push: Push) {
  return items.length > 0 && items.every((item) => preservesOperationalBreak(item, departure, returnTime, rules, push));
}

function preservesOperationalBreak(item: ResourcePoolItem, departure: number, returnTime: number, rules: PlanningRules, _push: Push) {
  return preservesLunchGap(item, departure, returnTime, rules);
}

function siteRules(rules: PlanningRules, siteCode?: string) {
  if (!siteCode) return {};
  return rules.siteOverrides?.[siteCode.toUpperCase()] ?? {};
}

function sharedSiteRules(flights: Flight[], rules: PlanningRules) {
  if (flights.length === 0) return undefined;
  const sites = new Set(flights.map((flight) => flight.originAirport?.toUpperCase()).filter(Boolean));
  if (sites.size !== 1) return undefined;
  return siteRules(rules, [...sites][0]);
}

function bestTrucksForPush(pool: ResourcePoolItem[], departure: number, count: number, push: Push) {
  const selected: ResourcePoolItem[] = [];
  const available = [...pool];

  while (selected.length < count && available.length > 0) {
    const next = bestTruckForPush(available, departure, push);
    if (!next) break;
    selected.push(next);
    available.splice(available.indexOf(next), 1);
  }

  return selected;
}

function bestTruckForPush(pool: ResourcePoolItem[], departure: number, push: Push) {
  const ready = pool
    .filter((item) => item.availableAt <= departure && truckCompatibleWithPush(item, push))
    .sort((a, b) => {
      const priorityDiff = truckPriorityForPush(a, push) - truckPriorityForPush(b, push);
      if (priorityDiff !== 0) return priorityDiff;
      if (a.assignedCount !== b.assignedCount) return b.assignedCount - a.assignedCount;
      return b.availableAt - a.availableAt;
    });

  if (ready.length > 0) return ready[0];

  return pool
    .filter((item) => truckCompatibleWithPush(item, push))
    .sort((a, b) => {
      const priorityDiff = truckPriorityForPush(a, push) - truckPriorityForPush(b, push);
      if (priorityDiff !== 0) return priorityDiff;
      return a.availableAt - b.availableAt;
    })[0];
}

function truckCompatibleWithPush(truck: ResourcePoolItem, push: Push) {
  if (push.flights.some((flight) => flight.aircraftCategory === "widebody")) return truck.vehicleType === "22 Ft. Truck";
  if (isSovTruck(truck)) return push.flights.every((flight) => flight.operationType === "express");
  return true;
}

function truckPriorityForPush(truck: ResourcePoolItem, push: Push) {
  if (push.flights.some((flight) => flight.aircraftCategory === "widebody")) return truck.vehicleType === "22 Ft. Truck" ? 0 : 10;
  if (push.flights.every((flight) => flight.operationType === "express")) return isSovTruck(truck) ? 0 : 1;
  if (truck.vehicleType === "16 Ft. Truck") return 0;
  if (truck.vehicleType === "22 Ft. Truck") return 1;
  return 5;
}

function helpersRequiredForPush(push: Push, trucks: ResourcePoolItem[], rules: PlanningRules) {
  if (push.flights.every(isInternationalStripFlight)) return false;
  if (trucks.length > 0 && trucks.every(isSovTruck)) return false;
  if (push.flights.every((flight) => flight.operationType === "express")) return false;
  return rules.helperRequiredForMainline;
}

function isSovTruck(truck: ResourcePoolItem) {
  return truck.vehicleType === "10 Ft. SOV" || truck.vehicleType === "14 Ft. SOV XL";
}

function truckShortageIssue(push: Push, _truckCount: number) {
  if (push.flights.some((flight) => isTwoTruckWidebodyAircraft(flight.aircraft))) return "777/787 needs two 22 ft trucks";
  if (push.flights.some((flight) => flight.aircraftCategory === "widebody")) return "Widebody needs a 22 ft truck";
  return "No compatible truck available";
}

function truckShortageAction(push: Push, _truckCount: number) {
  if (push.flights.some((flight) => isTwoTruckWidebodyAircraft(flight.aircraft))) return "Assign two 22 ft trucks to this 777/787 quick push.";
  if (push.flights.some((flight) => flight.aircraftCategory === "widebody")) return "Assign one 22 ft truck to this widebody push.";
  return "Add a compatible truck or delay a lower-priority push.";
}

function fitsStandardShift(item: ResourcePoolItem, departure: number, returnTime: number, rules: PlanningRules) {
  if (item.shiftStart !== undefined && item.shiftEnd !== undefined) {
    return item.shiftStart <= departure && returnTime <= item.shiftEnd;
  }
  const firstDeparture = item.firstDeparture ?? departure;
  const shiftStart = snapDown(firstDeparture - 15, rules);
  return returnTime <= shiftStart + standardShiftSpanMinutes(rules);
}

function preservesLunchGap(item: ResourcePoolItem, departure: number, returnTime: number, rules: PlanningRules) {
  const shiftStart = item.shiftStart ?? snapDown((item.firstDeparture ?? departure) - 15, rules);
  const shiftEnd = item.shiftEnd ?? shiftStart + standardShiftSpanMinutes(rules);
  if (shiftEnd - shiftStart < rules.lunchMinutes) return false;

  const assignments = [...item.assignments, { start: departure, end: returnTime }]
    .sort((a, b) => a.start - b.start);

  return hasLunchGap(assignments, shiftStart, shiftEnd, rules.lunchMinutes);
}

function hasLunchGap(assignments: ResourceAssignment[], windowStart: number, windowEnd: number, lunchMinutes: number) {
  let availableStart = windowStart;

  for (const assignment of assignments) {
    const gapStart = Math.max(availableStart, windowStart);
    const gapEnd = Math.min(assignment.start, windowEnd);
    if (gapEnd - gapStart >= lunchMinutes) return true;
    if (assignment.end >= availableStart) availableStart = assignment.end;
  }

  return windowEnd - Math.max(availableStart, windowStart) >= lunchMinutes;
}

function assignCrewPoolItems(items: ResourcePoolItem[], departure: number, returnTime: number, push: Push, field: "driverId" | "helperId", rules: PlanningRules) {
  push[field] = items.map((item) => item.id).join(" + ");
  for (const item of items) {
    item.firstDeparture = item.firstDeparture ?? departure;
    item.availableAt = returnTime;
    item.assignedCount += 1;
    item.assignments = [...item.assignments, { start: departure, end: returnTime }];
    if (!fitsStandardShift(item, item.firstDeparture, returnTime, rules)) {
      push.riskFlags = [...new Set([...push.riskFlags, "Shift exceeds standard shift span"])];
      push.exceptionFlags = [...new Set([...push.exceptionFlags, "Shift exceeds standard shift span"])];
    }
  }
}

function assignTruckPoolItems(items: ResourcePoolItem[], departure: number, returnTime: number, push: Push) {
  push.truckId = items.map((item) => item.id).join(" + ");
  for (const item of items) {
    item.firstDeparture = item.firstDeparture ?? departure;
    item.availableAt = returnTime;
    item.assignedCount += 1;
    item.assignments = [...item.assignments, { start: departure, end: returnTime }];
  }
}

function requiredTruckCount(push: Push) {
  if (push.flights.some(isWidebodyStripFlight)) return 2;
  return push.flights.some((flight) => isTwoTruckWidebodyAircraft(flight.aircraft)) ? 2 : 1;
}

function markException(push: Push, exceptions: ScheduleException[], issue: string, cause: ScheduleException["cause"], recommendedAction: string) {
  push.exceptionFlags.push(issue);
  push.riskFlags = [...new Set([...push.riskFlags, issue])];
  push.isFeasible = false;
  for (const flight of push.flights) {
    exceptions.push({
      id: `${push.id}-${flight.id}-${cause}`,
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      operationType: flight.operationType,
      serviceType: flight.serviceType,
      pushId: push.id,
      issue,
      cause,
      recommendedAction,
    });
  }
}

function markFlightException(push: Push, flight: Flight, exceptions: ScheduleException[], issue: string, cause: ScheduleException["cause"], recommendedAction: string) {
  push.exceptionFlags = [...new Set([...push.exceptionFlags, issue])];
  push.riskFlags = [...new Set([...push.riskFlags, issue])];
  if (cause === "delayed-flight-risk") push.isFeasible = false;
  exceptions.push({
    id: `${push.id}-${flight.id}-${cause}`,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    operationType: flight.operationType,
    serviceType: flight.serviceType,
    pushId: push.id,
    issue,
    cause,
    recommendedAction,
  });
}

function shiftPush(push: Push, delayMinutes: number) {
  push.loadStartTime = minutesToTime(timeToMinutes(push.loadStartTime) + delayMinutes);
  push.loadEndTime = minutesToTime(timeToMinutes(push.loadEndTime) + delayMinutes);
  push.kitchenDepartureTime = minutesToTime(timeToMinutes(push.kitchenDepartureTime) + delayMinutes);
  push.gateServiceTime = minutesToTime(timeToMinutes(push.gateServiceTime) + delayMinutes);
  push.arriveFirstGateTime = minutesToTime(timeToMinutes(push.arriveFirstGateTime) + delayMinutes);
  push.serviceEvents = push.serviceEvents.map((event) => ({
    ...event,
    serviceStart: minutesToTime(timeToMinutes(event.serviceStart) + delayMinutes),
    serviceEnd: minutesToTime(timeToMinutes(event.serviceEnd) + delayMinutes),
  }));
  push.returnTime = minutesToTime(timeToMinutes(push.returnTime) + delayMinutes);
}

function buildResult(mode: "planning" | "dispatch", pushes: Push[], exceptions: ScheduleException[], rules: PlanningRules = planningRules): ScheduleResult {
  const evaluatedPushes = pushes.map(applyRiskSeverity);
  const exceptionFlightIds = new Set(exceptions.map((item) => item.flightId).filter((id): id is string => Boolean(id)));
  const allTasks = evaluatedPushes.flatMap((push) => push.flights);
  const plannedTaskIds = new Set(allTasks.map((flight) => flight.id));
  const coveredTaskIds = new Set([...plannedTaskIds, ...exceptionFlightIds]);
  const stripTaskIds = new Set(allTasks.filter((flight) => flight.serviceType === "intl-strip").map((flight) => flight.id));
  const coveredOutboundFlightIds = [...coveredTaskIds].filter((flightId) => !flightId.endsWith("-intl-strip") && !stripTaskIds.has(flightId));
  const coveredStripTaskIds = [...coveredTaskIds].filter((flightId) => flightId.endsWith("-intl-strip") || stripTaskIds.has(flightId));
  const driverIds = new Set(evaluatedPushes.flatMap((push) => resourceIds(push.driverId)));
  const helperIds = new Set(evaluatedPushes.flatMap((push) => resourceIds(push.helperId).filter((id) => id !== "needed")));
  const truckIds = new Set(evaluatedPushes.flatMap((push) => truckIdsForPush(push.truckId)));
  const bottlenecks = [...new Set(exceptions.map((item) => humanCause(item.cause)))];
  const activePushMinutes = evaluatedPushes.reduce((total, push) => total + push.totalDurationMinutes, 0);
  const plannedShiftMinutes = driverIds.size * standardShiftSpanMinutes(rules);
  const shiftUtilizationPercent = plannedShiftMinutes > 0 ? Math.round((activePushMinutes / plannedShiftMinutes) * 100) : 0;
  const watchPushes = evaluatedPushes.filter((push) => push.riskSeverity === "watch").length;
  const urgentPushes = evaluatedPushes.filter((push) => push.riskSeverity === "urgent").length;
  const criticalPushes = evaluatedPushes.filter((push) => push.riskSeverity === "critical").length;

  return {
    mode,
    pushes: evaluatedPushes,
    exceptions,
    summary: {
      totalFlights: coveredOutboundFlightIds.length,
      totalStripTasks: coveredStripTaskIds.length,
      totalPushes: evaluatedPushes.length,
      driversRequired: driverIds.size,
      helpersRequired: helperIds.size,
      maxTrucksRequired: truckIds.size,
      flightsScheduledNormally: [...plannedTaskIds].filter((flightId) => !exceptionFlightIds.has(flightId)).length,
      flightsWithExceptions: exceptionFlightIds.size,
      unscheduledFlights: evaluatedPushes.filter((push) => !push.driverId || !push.truckId).flatMap((push) => push.flights).length,
      shiftUtilizationPercent,
      watchPushes,
      urgentPushes,
      criticalPushes,
    },
    resourceBottlenecks: bottlenecks,
    rules,
  };
}

function applyRiskSeverity(push: Push): Push {
  const serviceEvents = push.serviceEvents.map((event) => ({
    ...event,
    riskSeverity: event.riskSeverity ?? serviceRiskSeverity(event.riskStatus),
  }));
  const eventSeverity = serviceEvents.reduce<RiskSeverity>((worst, event) => worseSeverity(worst, event.riskSeverity), "normal");
  const flagSeverity = push.riskFlags.reduce<RiskSeverity>((worst, flag) => worseSeverity(worst, riskSeverityForFlag(flag)), "normal");
  const exceptionSeverity = push.exceptionFlags.reduce<RiskSeverity>((worst, flag) => worseSeverity(worst, riskSeverityForFlag(flag)), "normal");
  return {
    ...push,
    serviceEvents,
    riskSeverity: worseSeverity(eventSeverity, worseSeverity(flagSeverity, exceptionSeverity)),
  };
}

function serviceRiskSeverity(status: ServiceEvent["riskStatus"]): RiskSeverity {
  if (status === "unknown-aircraft") return "critical";
  if (status === "late-risk") return "critical";
  if (status === "urgent-risk") return "urgent";
  if (status === "watch") return "watch";
  return "normal";
}

function riskSeverityForFlag(flag: string): RiskSeverity {
  const normalized = flag.toLowerCase();
  if (normalized.includes("unknown") || normalized.includes("aircraft type")) return "critical";
  const hardMargin = normalized.match(/hardmargin = (-?\d+)m/);
  if (hardMargin) {
    const minutes = Number(hardMargin[1]);
    if (minutes < 0) return "critical";
    if (minutes <= 5) return "urgent";
    if (minutes <= 10) return "watch";
  }
  if (
    normalized.includes("unacceptable") ||
    normalized.includes("hard completion") ||
    normalized.includes("hardcompletion") ||
    normalized.includes("driver coverage") ||
    normalized.includes("helper coverage") ||
    normalized.includes("no truck") ||
    normalized.includes("two trucks") ||
    normalized.includes("shift exceeds")
  ) {
    return "urgent";
  }
  if (normalized.includes("target completion") || normalized.includes("targetcompletion") || normalized.includes("load window") || normalized.includes("watch")) return "watch";
  return "normal";
}

function worseSeverity(a: RiskSeverity, b: RiskSeverity): RiskSeverity {
  return riskRank[b] > riskRank[a] ? b : a;
}

const riskRank: Record<RiskSeverity, number> = {
  normal: 0,
  watch: 1,
  urgent: 2,
  critical: 3,
};

function truckIdsForPush(truckId: string | null) {
  return resourceIds(truckId);
}

function byDeparture(a: Push, b: Push) {
  return timeToMinutes(a.kitchenDepartureTime) - timeToMinutes(b.kitchenDepartureTime);
}

function byLatestCompletion(a: Push, b: Push) {
  const aCompletion = Math.min(...a.flights.map((flight) => timeToMinutes(flight.hardLatestCompletion)));
  const bCompletion = Math.min(...b.flights.map((flight) => timeToMinutes(flight.hardLatestCompletion)));
  return aCompletion - bCompletion;
}

function byLongestDuration(a: Push, b: Push) {
  return b.totalDurationMinutes - a.totalDurationMinutes;
}

function assignmentScore(pushes: Push[], rules: PlanningRules) {
  const driverCount = new Set(pushes.flatMap((push) => resourceIds(push.driverId))).size;
  const helperCount = new Set(pushes.flatMap((push) => resourceIds(push.helperId).filter((id) => id !== "needed"))).size;
  const truckCount = new Set(pushes.flatMap((push) => truckIdsForPush(push.truckId))).size;
  const issueCount = pushes.reduce((total, push) => total + push.exceptionFlags.length, 0);
  const activePushMinutes = pushes.reduce((total, push) => total + push.totalDurationMinutes, 0);
  const unusedDriverShiftMinutes = Math.max(0, driverCount * standardShiftSpanMinutes(rules) - activePushMinutes);
  return issueCount * 100000 + driverCount * 10000 + unusedDriverShiftMinutes + helperCount * 50 + truckCount;
}

function workloadFor(serviceType: ServiceType, aircraftCategory: AircraftCategory) {
  if (serviceType === "intl-strip") {
    if (aircraftCategory === "widebody") return 2;
    if (aircraftCategory === "narrowbody") return 1.25;
    if (aircraftCategory === "regional") return 1;
    return 1.5;
  }
  if (aircraftCategory === "widebody") return 2;
  if (aircraftCategory === "narrowbody") return 1.5;
  if (aircraftCategory === "regional") return 1;
  if (aircraftCategory === "unknown") return 1.75;
  if (serviceType === "load-ua") return 1.5;
  if (serviceType === "load-other") return 1.25;
  if (serviceType === "unplanned") return 1.5;
  return 1;
}

function isInternationalStripFlight(flight: Flight) {
  return flight.serviceType === "intl-strip";
}

function isWidebodyStripFlight(flight: Flight) {
  return isInternationalStripFlight(flight) && flight.aircraftCategory === "widebody";
}

function humanCause(cause: ScheduleException["cause"]) {
  return { "driver-shortage": "Driver shortage", "helper-shortage": "Helper shortage", "truck-shortage": "Truck shortage", "timing-conflict": "Timing conflict", "food-safety-window": "Food safety window issue", "delayed-flight-risk": "Unacceptable delay risk" }[cause];
}

function validTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 47 && minutes >= 0 && minutes <= 59;
}

export function timeToMinutes(time: string) {
  if (!validTime(time)) throw new Error(`Invalid time value: "${time}". Expected HH:mm.`);
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const normalized = Math.max(0, totalMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function standardShiftSpanMinutes(rules: PlanningRules) { return rules.standardShiftHours * 60 + rules.lunchMinutes; }
function snapDown(minutes: number, rules: PlanningRules) { return Math.floor(minutes / rules.blockMinutes) * rules.blockMinutes; }
function snapUp(minutes: number, rules: PlanningRules) { return Math.ceil(minutes / rules.blockMinutes) * rules.blockMinutes; }
