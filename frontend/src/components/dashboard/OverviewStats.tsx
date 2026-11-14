import type { ComponentType, SVGProps } from "react";
import { AlertTriangleIcon, FolderIcon, LayersIcon, TrendingUpIcon } from "../Icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type Stat = {
  label: string;
  value: string;
  icon: IconComponent;
  iconClass: string;
  badge?: {
    text: string;
    pillClass: string;
    hasTrendIcon?: boolean;
    hasWarningIcon?: boolean;
  };
};

const stats: Stat[] = [
  {
    label: "Active projects",
    value: "24",
    icon: FolderIcon,
    iconClass: "bg-panel text-brand-dark",
    badge: {
      text: "+3 this month",
      pillClass: "bg-oksoft text-ok",
      hasTrendIcon: true,
    },
  },
  {
    label: "Components tracked",
    value: "8,492",
    icon: LayersIcon,
    iconClass: "bg-panel text-brand-dark",
  },
  {
    label: "Findings to review",
    value: "17",
    icon: AlertTriangleIcon,
    iconClass: "bg-badsoft text-bad",
    badge: {
      text: "2 critical",
      pillClass: "bg-badsoft text-bad",
      hasWarningIcon: true,
    },
  },
];

export function OverviewStats() {
  return (
    <section aria-label="Workspace statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <article
            key={stat.label}
            className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 shadow-xs sm:p-5"
          >
            <div className="flex items-center gap-3.5">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}
              >
                <Icon className="h-5 w-5" />
              </span>

              <div>
                <p className="text-[12.5px] font-medium text-muted">{stat.label}</p>
                <p className="text-[26px] font-bold tracking-tight text-ink sm:text-[28px]">
                  {stat.value}
                </p>
              </div>
            </div>

            {stat.badge ? (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${stat.badge.pillClass}`}
              >
                {stat.badge.hasTrendIcon ? (
                  <TrendingUpIcon className="h-3 w-3" />
                ) : null}
                {stat.badge.hasWarningIcon ? (
                  <AlertTriangleIcon className="h-3 w-3" />
                ) : null}
                {stat.badge.text}
              </span>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
