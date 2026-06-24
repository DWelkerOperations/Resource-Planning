import { useMemo, useState } from "react";
import { openRuleQuestions, ruleItemsFromPlanningRules } from "../../data/mockRules";
import { aircraftInterpretations } from "../../import/aircraftMap";
import type { AircraftCategory, PlanningRules, RuleItem } from "../../types/dispatch";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

type RuleValues = Record<string, string>;

type ThumbRulesPageProps = {
  rules: PlanningRules;
  onRulesChange: (rules: PlanningRules) => void;
};

const editableRuleIds = new Set(["r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r14", "r15", "r16", "r19"]);

export function ThumbRulesPage({ rules, onRulesChange }: ThumbRulesPageProps) {
  const displayedRules = useMemo(() => ruleItemsFromPlanningRules(rules), [rules]);
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [ruleValues, setRuleValues] = useState<RuleValues>(() => valuesFromRules(displayedRules));
  const [draftRuleValues, setDraftRuleValues] = useState<RuleValues>(() => valuesFromRules(displayedRules));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasPendingChanges = displayedRules.some((rule) => draftRuleValues[rule.id] !== ruleValues[rule.id]);

  function handleUnlock() {
    if (password === "1234") {
      setIsUnlocked(true);
      setUnlockError(null);
      setSaveMessage(null);
      setSaveError(null);
      setDraftRuleValues(ruleValues);
      setPassword("");
      return;
    }

    setUnlockError("Incorrect password.");
  }

  function handleLock() {
    setIsUnlocked(false);
    setPassword("");
    setUnlockError(null);
    setSaveMessage(null);
    setSaveError(null);
    setDraftRuleValues(ruleValues);
  }

  function handleSaveRules() {
    const parsed = parseEditableRules(draftRuleValues, rules);
    if (!parsed.ok) {
      setSaveError(parsed.error);
      setSaveMessage(null);
      return;
    }

    setRuleValues(draftRuleValues);
    onRulesChange(parsed.rules);
    setSaveError(null);
    setSaveMessage("Rule edits approved for this session. Regenerate pairings to use the updated rules.");
  }

  function handleCancelRules() {
    setDraftRuleValues(ruleValues);
    setSaveMessage(null);
    setSaveError(null);
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Thumb Rules</h2><p className="mt-1 text-sm text-slate-500">Authoritative standards, active assumptions, and open operational questions used when creating tasks.</p></div>
      <Panel className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-ink">Rule Edit Lock</h3>
            <p className="mt-1 text-sm text-slate-500">
              {isUnlocked ? "Rules are unlocked for session-only edits. Validated timing, staffing, and pairing rules update regenerated plans after save." : "Enter the approval password to unlock rule edits."}
            </p>
            {saveMessage && <p className="mt-2 text-xs font-semibold text-emerald-700">{saveMessage}</p>}
            {saveError && <p className="mt-2 text-xs font-semibold text-red-600">{saveError}</p>}
          </div>
          {isUnlocked ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSaveRules} disabled={!hasPendingChanges} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save Changes
              </button>
              <button type="button" onClick={handleCancelRules} disabled={!hasPendingChanges} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
                Cancel Changes
              </button>
              <button type="button" onClick={handleLock} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Lock Rules
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setUnlockError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleUnlock();
                  }}
                  className="mt-2 w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <button type="button" onClick={handleUnlock} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Unlock
              </button>
              {unlockError && <span className="pb-2 text-xs font-semibold text-red-600">{unlockError}</span>}
            </div>
          )}
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-3">Category</th><th className="px-5 py-3">Setting</th><th className="px-5 py-3">Current standard / assumption</th><th className="px-5 py-3">Edit effect</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedRules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-5 py-4"><Badge tone="blue">{rule.category}</Badge></td>
                <td className="px-5 py-4 font-semibold text-ink">{rule.setting}</td>
                <td className="px-5 py-4 text-slate-700">
                  {isUnlocked ? (
                    <input
                      value={draftRuleValues[rule.id]}
                      onChange={(event) => {
                        setDraftRuleValues((current) => ({ ...current, [rule.id]: event.target.value }));
                        setSaveMessage(null);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    ruleValues[rule.id]
                  )}
                </td>
                <td className="px-5 py-4">
                  <Badge tone={editableRuleIds.has(rule.id) ? "green" : "gray"}>{editableRuleIds.has(rule.id) ? "Affects regenerated plans" : "Display note"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-ink">Open Questions</h3>
            <p className="mt-1 text-sm text-slate-500">These need answers before the dispatcher tool can treat the behavior as operationally authoritative.</p>
          </div>
          <Badge tone="orange">{openRuleQuestions.length} unresolved</Badge>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-3">Area</th><th className="px-5 py-3">Question</th><th className="px-5 py-3">Clarification needed</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {openRuleQuestions.map((question) => (
              <tr key={question.id}>
                <td className="px-5 py-4"><Badge tone="orange">{question.category}</Badge></td>
                <td className="px-5 py-4 font-semibold text-ink">{question.setting}</td>
                <td className="px-5 py-4 text-slate-700">{question.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-ink">Aircraft Interpretation</h3>
            <p className="mt-1 text-sm text-slate-500">Raw aircraft names from the schedule and how they are counted for task creation.</p>
          </div>
          <Badge tone="gray">{aircraftInterpretations.length} mapped types</Badge>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Schedule input</th>
              <th className="px-5 py-3">Standard aircraft name</th>
              <th className="px-5 py-3">Task category</th>
              <th className="px-5 py-3">Preferred on</th>
              <th className="px-5 py-3">Service time</th>
              <th className="px-5 py-3">Truck rule</th>
              <th className="px-5 py-3">Planning impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aircraftInterpretations.map((aircraft) => (
              <tr key={aircraft.inputName} className="bg-white">
                <td className="px-5 py-3 font-semibold text-ink">{aircraft.inputName}</td>
                <td className="px-5 py-3 text-slate-700">{aircraft.standardName}</td>
                <td className="px-5 py-3"><Badge tone={categoryTone(aircraft.category)}>{categoryLabel[aircraft.category]}</Badge></td>
                <td className="px-5 py-3 font-semibold text-slate-700">D-{aircraft.preferredOnMinutes}</td>
                <td className="px-5 py-3 font-semibold text-slate-700">{aircraft.serviceMinutes} min</td>
                <td className="px-5 py-3 text-slate-700">{aircraft.truckRule}</td>
                <td className="px-5 py-3 text-slate-600">{categoryImpact[aircraft.category]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

const categoryLabel: Record<AircraftCategory, string> = {
  regional: "Regional",
  narrowbody: "Narrowbody",
  widebody: "Widebody",
  unknown: "Unknown",
};

const categoryImpact: Record<AircraftCategory, string> = {
  regional: "On D-40, 10 min service, express grouping only",
  narrowbody: "On D-50, 25 min service; 757 on D-65, 40 min service",
  widebody: "On D-90, 50 min service, standalone protected push",
  unknown: "Flagged until mapped",
};

function categoryTone(category: AircraftCategory) {
  if (category === "regional") return "green";
  if (category === "narrowbody") return "blue";
  if (category === "widebody") return "orange";
  return "red";
}

function valuesFromRules(rules: RuleItem[]): RuleValues {
  return Object.fromEntries(rules.map((rule) => [rule.id, rule.value]));
}

function parseEditableRules(values: RuleValues, currentRules: PlanningRules): { ok: true; rules: PlanningRules } | { ok: false; error: string } {
  const hardMinimumCompletionBeforeDepartureMinutes = firstPositiveNumber(values.r2);
  const maxKitchenDepartureBeforeDepartureMinutes = firstPositiveNumber(values.r3);
  const defaultDriveMinutes = secondNumber(values.r4);
  const firstAircraftSetupMinutes = firstPositiveNumber(values.r5);
  const standardShiftHours = firstPositiveNumber(values.r6);
  const serviceTimes = numbersFromText(values.r8);
  const helperRequiredForMainline = yesNoValue(values.r9);
  const maxFlightsPerPush = firstPositiveNumber(values.r14);
  const groupWindowMinutes = firstPositiveNumber(values.r15);
  const maxWorkloadUnitsPerPush = firstPositiveNumber(values.r16);
  const lunchMinutes = firstPositiveNumber(values.r19);

  if (hardMinimumCompletionBeforeDepartureMinutes === null) return invalid("Domestic hard-off");
  if (maxKitchenDepartureBeforeDepartureMinutes === null) return invalid("Food-safety dispatch departure");
  if (defaultDriveMinutes === null) return invalid("Default drive / return time");
  if (firstAircraftSetupMinutes === null) return invalid("Load sequence");
  if (standardShiftHours === null) return invalid("Standard driver shift");
  if (serviceTimes.length < 4) return invalid("Service times");
  if (helperRequiredForMainline === null) return invalid("Mainline helper required");
  if (maxFlightsPerPush === null) return invalid("Max flights per push");
  if (groupWindowMinutes === null) return invalid("Group window");
  if (maxWorkloadUnitsPerPush === null) return invalid("Max workload per push");
  if (lunchMinutes === null) return invalid("Required lunch gap");

  return {
    ok: true,
    rules: {
      ...currentRules,
      hardMinimumCompletionBeforeDepartureMinutes,
      maxKitchenDepartureBeforeDepartureMinutes,
      mainlineDriveOutMinutes: defaultDriveMinutes,
      expressDriveOutMinutes: defaultDriveMinutes,
      mainlineReturnMinutes: defaultDriveMinutes,
      expressReturnMinutes: defaultDriveMinutes,
      firstAircraftSetupMinutes,
      standardShiftHours,
      serviceMinutesByAircraftCategory: {
        ...currentRules.serviceMinutesByAircraftCategory,
        regional: serviceTimes[0],
        narrowbody: serviceTimes[1],
        widebody: serviceTimes[3],
      },
      helperRequiredForMainline,
      maxFlightsPerPush,
      groupWindowMinutes,
      maxWorkloadUnitsPerPush,
      lunchMinutes,
    },
  };
}

function invalid(label: string) {
  return { ok: false as const, error: `${label} needs a valid positive value before rules can be saved.` };
}

function firstPositiveNumber(value: string) {
  const [first] = numbersFromText(value);
  return first !== undefined && first > 0 ? first : null;
}

function secondNumber(value: string) {
  const numbers = numbersFromText(value);
  const selected = numbers[1] ?? numbers[0];
  return selected !== undefined && selected > 0 ? selected : null;
}

function numbersFromText(value: string) {
  return [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function yesNoValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "required"].includes(normalized)) return true;
  if (["no", "n", "false", "not required"].includes(normalized)) return false;
  return null;
}
