"use client";

import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CodeIcon,
  CubeIcon,
  FolderIcon,
  InfoIcon,
  LayersIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from "../Icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type SBOMStatus = "Complete" | "Review needed";

type Project = {
  name: string;
  description: string;
  components: number;
  sbomStatus: SBOMStatus;
  score: number;
  lastScanned: string;
  icon: IconComponent;
};

const projects: Project[] = [
  {
    name: "api-gateway",
    description: "Edge API and service routing",
    components: 1327,
    sbomStatus: "Complete",
    score: 87,
    lastScanned: "Jan 29, 2025, 10:24 AM",
    icon: CodeIcon,
  },
  {
    name: "customer-portal",
    description: "Customer web application",
    components: 2781,
    sbomStatus: "Complete",
    score: 91,
    lastScanned: "Jan 28, 2025, 4:17 PM",
    icon: CubeIcon,
  },
  {
    name: "data-platform",
    description: "Data processing and analytics",
    components: 3904,
    sbomStatus: "Review needed",
    score: 78,
    lastScanned: "Jan 27, 2025, 9:02 AM",
    icon: LayersIcon,
  },
  {
    name: "ml-inference",
    description: "Model serving and inference",
    components: 480,
    sbomStatus: "Complete",
    score: 96,
    lastScanned: "Jan 29, 2025, 8:46 AM",
    icon: FolderIcon,
  },
];

const statusOptions = ["All statuses", "Complete", "Review needed"] as const;
const riskOptions = ["All risk levels", "Low (90+)", "Medium (75-89)", "High (<75)"] as const;

export function RecentProjects() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(statusOptions[0]);
  const [risk, setRisk] = useState<string>(riskOptions[0]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return projects.filter((project) => {
      if (search && !project.name.toLowerCase().includes(search) && !project.description.toLowerCase().includes(search)) {
        return false;
      }
      if (status !== statusOptions[0] && project.sbomStatus !== status) {
        return false;
      }
      if (risk === "Low (90+)" && project.score < 90) return false;
      if (risk === "Medium (75-89)" && (project.score < 75 || project.score >= 90)) return false;
      if (risk === "High (<75)" && project.score >= 75) return false;

      return true;
    });
  }, [query, status, risk]);

  return (
    <section
      aria-labelledby="recent-projects-heading"
      className="rounded-xl border border-line bg-surface shadow-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-5 pb-4">
        <h2
          id="recent-projects-heading"
          className="text-[16px] font-bold text-ink"
        >
          Recent projects
        </h2>
        <a
          href="/projects"
          className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-dark transition-colors hover:text-brand-deep"
        >
          View all projects &rarr;
        </a>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-light" />
          <input suppressHydrationWarning
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-[12.5px] text-ink placeholder:text-muted-light transition-colors hover:border-line focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <label className="relative inline-flex items-center rounded-lg border border-line bg-surface py-1.5 pr-7 pl-3 text-[12.5px] font-medium text-ink transition-colors hover:border-line">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent outline-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-light" />
          </label>

          <label className="relative inline-flex items-center rounded-lg border border-line bg-surface py-1.5 pr-7 pl-3 text-[12.5px] font-medium text-ink transition-colors hover:border-line">
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent outline-none"
            >
              {riskOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-light" />
          </label>
        </div>
      </div>

      {/* Projects Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-y border-line-soft bg-chip text-[12px] font-semibold text-muted">
              <th scope="col" className="py-2.5 pr-4 pl-5">
                Project
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Components
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                SBOM status
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                <span className="inline-flex items-center gap-1">
                  Risk score
                  <InfoIcon className="h-3.5 w-3.5 text-muted-light" />
                </span>
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Last scanned
              </th>
              <th scope="col" className="py-2.5 pr-5 pl-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {filtered.map((project) => {
              const Icon = project.icon;
              const isComplete = project.sbomStatus === "Complete";
              const isGoodScore = project.score >= 85;

              return (
                <tr
                  key={project.name}
                  className="transition-colors hover:bg-panel"
                >
                  {/* Project Info */}
                  <td className="py-3.5 pr-4 pl-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel text-brand-dark">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">
                          {project.name}
                        </p>
                        <p className="truncate text-[11.5px] text-muted">
                          {project.description}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Components */}
                  <td className="px-4 py-3.5 font-medium text-ink-soft tabular-nums">
                    {project.components.toLocaleString("en-US")}
                  </td>

                  {/* SBOM Status */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        isComplete
                          ? "bg-oksoft text-ok"
                          : "bg-warnsoft text-warn"
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircleIcon className="h-3.5 w-3.5" />
                      )}
                      {project.sbomStatus}
                    </span>
                  </td>

                  {/* Risk Score */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        isGoodScore
                          ? "bg-oksoft text-ok"
                          : "bg-warnsoft text-warn"
                      }`}
                    >
                      {project.score}/100
                    </span>
                  </td>

                  {/* Last Scanned */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-[12px] text-muted">
                    {project.lastScanned}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 pr-5 pl-4 text-right">
                    <button
                      type="button"
                      aria-label={`More actions for ${project.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-light transition-colors hover:bg-panel-deep hover:text-brand-dark"
                    >
                      <MoreHorizontalIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
