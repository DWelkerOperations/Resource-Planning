import type { ServiceType } from "../../types/dispatch";
import { serviceLabels, serviceStyle } from "./timelineUtils";

const serviceTypes: ServiceType[] = ["load-ua", "load-other", "positioning", "other-work", "break", "unplanned"];

export function TimelineLegend() {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {serviceTypes.map((serviceType) => (
          <div key={serviceType} className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className={`h-3 w-3 rounded-full border ${serviceStyle(serviceType)}`} />
            {serviceLabels[serviceType]}
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="h-3 w-7 rounded border border-emerald-100 bg-emerald-50" />
          On shift
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="h-3 w-7 rounded border border-red-100 bg-red-50" />
          OT watch
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="h-3 w-7 rounded border-2 border-blue-500 bg-blue-100" />
          Dispatcher edit
        </div>
      </div>
      <div className="shrink-0 text-xs font-medium text-slate-500">Mock plan · ORD morning bank</div>
    </div>
  );
}
