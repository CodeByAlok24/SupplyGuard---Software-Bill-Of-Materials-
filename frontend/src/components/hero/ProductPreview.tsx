import type { ComponentType, SVGProps } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CubeIcon,
  FileTextIcon,
  HomeIcon,
  InfoIcon,
  LayersIcon,
  SettingsIcon,
  ShieldIcon,
  ShieldMark,
  SlidersIcon,
  ArrowRightIcon,
} from "../Icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  label: string;
  icon: IconComponent;
  active?: boolean;
};

const dashboardNav: NavItem[] = [
  { label: "Overview", icon: HomeIcon, active: true },
  { label: "Projects", icon: LayersIcon },
  { label: "SBOMs", icon: FileTextIcon },
  { label: "Licenses", icon: ShieldIcon },
  { label: "Vulnerabilities", icon: AlertTriangleIcon },
  { label: "Policies", icon: SlidersIcon },
  { label: "Settings", icon: SettingsIcon },
];

type Finding = {
  name: string;
  pkg: string;
  severity: string;
  icon: IconComponent;
  iconClass: string;
  badgeClass: string;
};

const findings: Finding[] = [
  {
    name: "CVE-2024-50379",
    pkg: "libxml2@2.11.6",
    severity: "Critical",
    icon: AlertTriangleIcon,
    iconClass: "text-bad",
    badgeClass: "bg-[#fde3eb] text-[#b91c1c]",
  },
  {
    name: "GPL-3.0 license",
    pkg: "jsondiff@0.10.0",
    severity: "High",
    icon: AlertTriangleIcon,
    iconClass: "text-warn",
    badgeClass: "bg-[#fdeedd] text-[#b45309]",
  },
  {
    name: "CVE-2024-3187",
    pkg: "openssl@3.0.13",
    severity: "Medium",
    icon: InfoIcon,
    iconClass: "text-brand",
    badgeClass: "bg-[#fbf2c9] text-[#b45309]",
  },
];

const chartPoints = [
  { x: 46, y: 96, label: "Jan 1" },
  { x: 124, y: 81, label: "Jan 8" },
  { x: 202, y: 63, label: "Jan 15" },
  { x: 280, y: 54, label: "Jan 22" },
  { x: 358, y: 45, label: "Jan 29" },
];

const chartGridLines = [12, 42, 72, 102, 132];

const statCardClass =
  "rounded-[10px] border border-line-soft bg-surface px-3.5 pb-[13px] pt-3 [box-shadow:0_1px_2px_rgba(25,21,36,0.03)] max-[700px]:p-2.5";

export function ProductPreview() {
  return (
    <div className="relative">
      <div className="absolute -top-[27px] -right-[10px] z-[4] inline-flex items-center gap-[9px] whitespace-nowrap rounded-xl bg-[#d9f6e2] px-[18px] py-[11px] text-[13px] font-bold tracking-[-0.01em] text-ok [box-shadow:0_18px_34px_-20px_rgba(18,90,50,0.45)] max-[700px]:-top-5 max-[700px]:right-1.5 max-[700px]:px-[13px] max-[700px]:py-2 max-[700px]:text-[11.5px]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a05a] text-white max-[700px]:h-[21px] max-[700px]:w-[21px]">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
        Policy passed
      </div>

      <div
        role="img"
        aria-label="Illustrative product preview with example dashboard metrics and findings. This is not live workspace data."
        className="grid grid-cols-[174px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-line-soft bg-surface text-left [box-shadow:0_46px_90px_-46px_rgba(53,17,116,0.5),0_14px_34px_-24px_rgba(53,17,116,0.26)] max-[700px]:grid-cols-1"
      >
        <aside className="border-r border-line-soft bg-panel px-[11px] pt-[17px] pb-[22px] max-[700px]:hidden">
          <div className="flex items-center gap-[7px] px-2 pt-0.5 pb-[15px] font-display text-[14px] font-extrabold tracking-[-0.02em] text-ink">
            <ShieldMark className="h-[18px] w-[18px] text-brand" />
            SupplyGuard
          </div>

          <ul className="flex flex-col gap-px">
            {dashboardNav.map((item) => {
              const Icon = item.icon;

              return (
                <li
                  key={item.label}
                  className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12.5px] ${
                    item.active
                      ? "bg-[#ece2fe] font-semibold text-[#6d21e8]"
                      : "font-medium text-muted"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      item.active ? "text-[#6d21e8]" : "text-muted"
                    }`}
                  />
                  {item.label}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0 p-[20px_22px_22px] max-[700px]:p-4">
          <div className="mb-2 inline-flex rounded-full bg-[#f3edff] px-2.5 py-1 text-[10px] font-bold text-[#6d21e8]">Illustrative product preview · example data</div>
          <div className="flex items-center justify-between gap-4 max-[380px]:gap-2">
            <h2 className="font-display text-[21px] font-extrabold tracking-[-0.025em] text-ink-strong max-[700px]:text-[18px]">
              Security posture
            </h2>
            <span className="inline-flex cursor-default items-center gap-[7px] rounded-md border border-line bg-surface px-[9px] py-[5px] text-[11px] font-medium text-muted max-[380px]:gap-1 max-[380px]:px-1.5 max-[380px]:text-[9.5px]">
              Last 30 days
              <ChevronDownIcon className="h-[11px] w-[11px] text-muted max-[380px]:h-2.5 max-[380px]:w-2.5" />
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-[1.14fr_1fr_1fr] gap-2.5 max-[480px]:grid-cols-2">
            <article className={`${statCardClass} max-[480px]:col-span-2`}>
              <p className="flex items-center gap-[5px] text-[11.5px] font-semibold text-ink-soft max-[700px]:text-[10px]">
                Posture score
                <InfoIcon className="h-[11px] w-[11px] text-muted-light" />
              </p>
              <p className="mt-[3px] flex items-baseline gap-[3px] font-display text-[29px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink-strong max-[700px]:text-[22px]">
                94
                <span className="font-sans text-[12.5px] font-medium tracking-normal text-muted-light">
                  /100
                </span>
                <span className="ml-auto self-center rounded-full bg-[#e2f8e9] px-[7px] py-[3px] text-[9.5px] font-bold text-mint max-[700px]:hidden">
                  &#8593; +4
                </span>
              </p>
            </article>

            <article className={statCardClass}>
              <p className="flex items-center gap-[5px] text-[11.5px] font-semibold text-ink-soft max-[700px]:text-[10px]">
                <LayersIcon className="h-3 w-3 text-muted-light" />
                Projects
              </p>
              <p className="mt-[3px] font-display text-[29px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink-strong max-[700px]:text-[22px]">
                36
              </p>
            </article>

            <article className={statCardClass}>
              <p className="flex items-center gap-[5px] text-[11.5px] font-semibold text-ink-soft max-[700px]:text-[10px]">
                <CubeIcon className="h-3 w-3 text-muted-light" />
                Components
              </p>
              <p className="mt-[3px] font-display text-[29px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink-strong max-[700px]:text-[22px]">
                12,480
              </p>
            </article>
          </div>

          <div className="mt-2.5 grid grid-cols-[1.32fr_1fr] gap-2.5 max-[700px]:grid-cols-1">
            <article className="min-w-0 rounded-[10px] border border-line-soft bg-surface p-[13px_14px_9px] [box-shadow:0_1px_2px_rgba(25,21,36,0.03)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-[5px] text-xs font-bold text-ink-soft">
                  Security posture trend
                  <InfoIcon className="h-[11px] w-[11px] text-muted-light" />
                </h3>
              </div>

              <svg
                viewBox="0 0 372 168"
                className="mt-[7px] h-auto w-full overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {chartGridLines.map((y) => (
                  <line
                    key={y}
                    x1="46"
                    y1={y}
                    x2="358"
                    y2={y}
                    className="stroke-[#f0ebf8]"
                    strokeWidth="1"
                  />
                ))}

                <g className="fill-[#9c96aa] text-[8px]" textAnchor="end">
                  <text x="36" y="15">100</text>
                  <text x="36" y="45">95</text>
                  <text x="36" y="75">90</text>
                  <text x="36" y="105">85</text>
                  <text x="36" y="135">80</text>
                </g>

                <path
                  d="M46 96 L124 81 L202 63 L280 54 L358 45 L358 132 L46 132 Z"
                  fill="url(#trendFill)"
                />
                <polyline
                  points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {chartPoints.map((point, index) => (
                  <circle
                    key={point.label}
                    cx={point.x}
                    cy={point.y}
                    r={index === chartPoints.length - 1 ? 3.2 : 2.4}
                    fill={index === chartPoints.length - 1 ? "#7c3aed" : "#ffffff"}
                    stroke={index === chartPoints.length - 1 ? "none" : "#7c3aed"}
                    strokeWidth="1.6"
                  />
                ))}

                <g className="fill-[#9c96aa] text-[8px]" textAnchor="middle">
                  {chartPoints.map((point) => (
                    <text key={point.label} x={point.x} y="160">
                      {point.label}
                    </text>
                  ))}
                </g>
              </svg>
            </article>

            <article className="min-w-0 rounded-[10px] border border-line-soft bg-surface p-[13px_14px_9px] [box-shadow:0_1px_2px_rgba(25,21,36,0.03)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-ink-soft">Recent findings</h3>
                <span className="inline-flex items-center gap-[3px] text-[10px] font-semibold text-[#6d21e8]">
                  View all
                  <ArrowRightIcon className="h-2.5 w-2.5" />
                </span>
              </div>

              <ul className="mt-3.5 flex flex-col gap-3 pb-[3px]">
                {findings.map((finding) => {
                  const Icon = finding.icon;

                  return (
                    <li key={finding.name} className="flex items-center gap-2">
                      <Icon className={`h-[17px] w-[17px] shrink-0 ${finding.iconClass}`} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[11px] font-bold text-ink">
                          {finding.name}
                        </span>
                        <span className="truncate text-[9.5px] text-muted-light">
                          {finding.pkg}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold tracking-[0.01em] ${finding.badgeClass}`}
                      >
                        {finding.severity}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </article>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-[10px] -left-5 z-[4] inline-flex items-center gap-[9px] whitespace-nowrap rounded-xl border border-line-soft bg-[#fcfaff] px-[18px] py-[11px] text-[13px] font-bold tracking-[-0.01em] text-ink-soft [box-shadow:0_20px_42px_-20px_rgba(58,24,120,0.42)] max-[700px]:hidden">
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#f0e6fe] text-[#6d21e8]">
          <LayersIcon className="h-[15px] w-[15px]" />
        </span>
        SBOM ready
      </div>
    </div>
  );
}
