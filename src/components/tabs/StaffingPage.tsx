import { useMemo, useState } from "react";
import { Clock3, UserCheck, UserX, Users } from "lucide-react";
import { mockStaffing, staffRoles, staffStatuses } from "../../data/mockStaffing";
import type { StaffMember, StaffRole, StaffStatus } from "../../types/dispatch";
import { KpiCard } from "../ui/KpiCard";
import { Panel } from "../ui/Panel";

type StaffFilter = "All";

export function StaffingPage() {
  const [staff, setStaff] = useState<StaffMember[]>(mockStaffing);
  const [roleFilter, setRoleFilter] = useState<StaffRole | StaffFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StaffStatus | StaffFilter>("All");
  const [shiftFilter, setShiftFilter] = useState<string>("All");

  const shiftStarts = useMemo(() => Array.from(new Set(staff.map((member) => member.shift.start))), [staff]);
  const filteredStaff = staff.filter((member) => {
    const roleMatches = roleFilter === "All" || member.role === roleFilter;
    const statusMatches = statusFilter === "All" || member.status === statusFilter;
    const shiftMatches = shiftFilter === "All" || member.shift.start === shiftFilter;
    return roleMatches && statusMatches && shiftMatches;
  });

  const driversAvailable = staff.filter((member) => member.role === "Driver" && member.status === "Available").length;
  const helpersAvailable = staff.filter((member) => member.role === "Helper" && member.status === "Available").length;
  const unavailableCount = staff.filter((member) => member.status === "Unavailable" || member.status === "Call Out").length;
  const staffingByStart = shiftStarts.map((start) => `${start}: ${staff.filter((member) => member.shift.start === start).length}`).join(" · ");

  function updateStatus(employeeId: string, status: StaffStatus) {
    setStaff((currentStaff) =>
      currentStaff.map((member) => member.id === employeeId ? { ...member, status } : member),
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Staffing</h2>
        <p className="mt-1 text-sm text-slate-500">Mock staffing master list for drivers and helpers. Upload replacement comes later.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Staff" value={String(staff.length)} helper="Mock roster records" icon={<Users size={20} />} />
        <KpiCard label="Drivers Available" value={String(driversAvailable)} helper="Status = available" icon={<UserCheck size={20} />} />
        <KpiCard label="Helpers Available" value={String(helpersAvailable)} helper="Status = available" icon={<UserCheck size={20} />} />
        <KpiCard label="Unavailable / Call Out" value={String(unavailableCount)} helper="Manual status driven" icon={<UserX size={20} />} />
      </div>

      <Panel className="p-4">
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] items-end gap-4">
          <FilterSelect label="Role" value={roleFilter} options={["All", ...staffRoles]} onChange={(value) => setRoleFilter(value as StaffRole | StaffFilter)} />
          <FilterSelect label="Status" value={statusFilter} options={["All", ...staffStatuses]} onChange={(value) => setStatusFilter(value as StaffStatus | StaffFilter)} />
          <FilterSelect label="Shift Start" value={shiftFilter} options={["All", ...shiftStarts]} onChange={setShiftFilter} />
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-700"><Clock3 size={15} /> Staffing by start time</div>
            <div className="mt-1">{staffingByStart}</div>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Length</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned Push</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStaff.map((member) => (
              <tr key={member.id} className="bg-white">
                <td className="px-4 py-3"><div className="font-semibold text-ink">{member.name}</div><div className="text-xs text-slate-500">{member.id}</div></td>
                <td className="px-4 py-3 text-slate-700">{member.role}</td>
                <td className="px-4 py-3 text-slate-700">{member.shift.start} - {member.shift.end}</td>
                <td className="px-4 py-3 text-slate-700">{member.shift.lengthHours} hrs</td>
                <td className="px-4 py-3"><StatusSelect value={member.status} onChange={(status) => updateStatus(member.id, status)} /></td>
                <td className="px-4 py-3 text-slate-700">{member.assignedPush ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{member.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function StatusSelect({ value, onChange }: { value: StaffStatus; onChange: (value: StaffStatus) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as StaffStatus)} className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
      {staffStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );
}
