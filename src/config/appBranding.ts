import type { AppTab } from "../types/dispatch";

type AppVariant = "resource-planning" | "dispatch-tool-beta";

const appVariant = (__APP_VARIANT__ === "dispatch-tool-beta" ? "dispatch-tool-beta" : "resource-planning") satisfies AppVariant;

const stableTabs: AppTab[] = ["resource-guide", "thumb-rules"];

const betaTabs: AppTab[] = [
  "resource-guide",
  "planning",
  "ord-planner",
  "dispatch",
  "staffing",
  "fleet",
  "exceptions",
  "tour-sheet",
  "dashboard",
  "thumb-rules",
];

export const appBranding = {
  variant: appVariant,
  productName: appVariant === "dispatch-tool-beta" ? "Dispatch Tool Beta" : "Resource Planning",
  footerName: appVariant === "dispatch-tool-beta" ? "Dispatch Tool Beta" : "Resource Planning",
  visibleTabs: appVariant === "dispatch-tool-beta" ? betaTabs : stableTabs,
};

export function isVisibleAppTab(tab: AppTab) {
  return appBranding.visibleTabs.includes(tab);
}
