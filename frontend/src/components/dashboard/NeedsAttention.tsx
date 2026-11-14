import type { ComponentType, SVGProps } from "react";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  CubeIcon,
  ScaleIcon,
} from "../Icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type AttentionItem = {
  title: string;
  description: string;
  tag: string;
  icon: IconComponent;
  iconClass: string;
  tagClass: string;
};

const items: AttentionItem[] = [
  {
    title: "CVE-2024-50379 in api-gateway",
    description: "Critical vulnerability in jsonwebtoken (v9.0.0)",
    tag: "Critical",
    icon: AlertTriangleIcon,
    iconClass: "bg-badsoft text-bad",
    tagClass: "bg-badsoft text-bad",
  },
  {
    title: "GPL-3.0 license in customer-portal",
    description:
      "Component redis (v7.2.4) uses GPL-3.0, which may not be allowed by your policy.",
    tag: "License",
    icon: ScaleIcon,
    iconClass: "bg-panel text-brand-dark",
    tagClass: "bg-warnsoft text-warn",
  },
  {
    title: "SBOM missing for data-platform",
    description: "No SBOM found for the latest build (v1.12.0).",
    tag: "SBOM",
    icon: CubeIcon,
    iconClass: "bg-sky-100 text-sky-400",
    tagClass: "bg-sky-100 text-sky-400",
  },
];

export function NeedsAttention() {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
      <div>
        <h2 className="text-[16px] font-bold text-ink">Needs attention</h2>

        <ul className="mt-3 flex flex-col divide-y divide-line-soft">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.title}>
                <a
                  href="#"
                  className="group flex items-center justify-between gap-3 py-3 transition-colors hover:bg-panel"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconClass}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink group-hover:text-brand-dark">
                        {item.title}
                      </p>
                      <p className="truncate text-[11.5px] text-muted">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.tagClass}`}
                    >
                      {item.tag}
                    </span>
                    <ChevronRightIcon className="h-3.5 w-3.5 text-muted-light group-hover:text-ink transition-colors" />
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pt-4 border-t border-line-soft">
        <a
          href="#"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-dark transition-colors hover:text-brand-deep"
        >
          View all 17 findings &rarr;
        </a>
      </div>
    </article>
  );
}
