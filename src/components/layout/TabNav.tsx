import type { AppTab } from "../../types/dispatch";

export const tabs: { id: AppTab; label: string }[] = [
  { id: "planning", label: "Planning Tool" },
  { id: "dispatch", label: "Dispatch Tool" },
  { id: "timeline", label: "Dispatcher Timeline" },
  { id: "staffing", label: "Staffing" },
  { id: "fleet", label: "Fleet" },
  { id: "exceptions", label: "Exceptions" },
  { id: "tour-sheet", label: "Tour Sheet" },
  { id: "dashboard", label: "Dashboard" },
  { id: "thumb-rules", label: "Thumb Rules" },
];

type TabNavProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`rounded-full px-3 py-2 text-sm font-medium transition ${
            activeTab === tab.id
              ? "bg-ink text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
