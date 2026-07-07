import { BarChart3, CalendarDays, ClipboardCheck, LayoutDashboard, Menu, Plane, Ruler, Settings, Truck, Users, Wrench } from "lucide-react";
import { isVisibleAppTab } from "../../config/appBranding";
import type { AppTab } from "../../types/dispatch";

const navItems = [
  { id: "resource-guide", label: "Resource", icon: ClipboardCheck },
  { id: "planning", label: "Plan", icon: CalendarDays },
  { id: "ord-planner", label: "ORD", icon: Plane },
  { id: "dispatch", label: "Dispatch", icon: Truck },
  { id: "staffing", label: "Staffing", icon: Users },
  { id: "fleet", label: "Fleet", icon: Wrench },
  { id: "exceptions", label: "Issues", icon: BarChart3 },
  { id: "tour-sheet", label: "Tours", icon: ClipboardCheck },
  { id: "dashboard", label: "Dash", icon: LayoutDashboard },
  { id: "thumb-rules", label: "Rules", icon: Ruler },
] as const;

type SidebarProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="no-print flex w-[76px] shrink-0 flex-col items-center border-r border-slate-200 bg-white/80 py-5">
      <button className="mb-10 rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Menu">
        <Menu size={21} />
      </button>
      <nav className="flex flex-1 flex-col items-center gap-3">
        {navItems.filter((item) => isVisibleAppTab(item.id)).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex h-[58px] w-[58px] flex-col items-center justify-center rounded-2xl text-[11px] transition ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={19} />
              <span className="mt-1">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Settings">
        <Settings size={19} />
      </button>
    </aside>
  );
}
