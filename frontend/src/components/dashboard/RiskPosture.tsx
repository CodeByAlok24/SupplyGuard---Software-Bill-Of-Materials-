"use client";

import { ChevronDownIcon, InfoIcon } from "../Icons";

const radius = 56;
const circumference = 2 * Math.PI * radius;
const score = 92;

export function RiskPosture() {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[16px] font-bold text-ink">Risk posture</h2>
          <button
            type="button"
            aria-label="More information about risk posture"
            className="text-muted-light transition-colors hover:text-ink"
          >
            <InfoIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="relative inline-flex items-center rounded-lg border border-line bg-surface py-1 pr-6 pl-2.5 text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-line">
          <span className="sr-only">Time range for risk posture</span>
          <select
            defaultValue="30"
            className="cursor-pointer appearance-none bg-transparent outline-none"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2 h-3 w-3 text-muted-light" />
        </label>
      </div>

      {/* Middle: Gauge + Chart */}
      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        {/* Left: Donut Gauge */}
        <div className="flex shrink-0 flex-col items-center">
          <div
            role="img"
            aria-label="Risk score: 92 out of 100"
            className="relative h-[136px] w-[136px]"
          >
            <svg viewBox="0 0 140 140" className="h-full w-full" aria-hidden="true">
              {/* Background track */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="#e5f7ed"
                strokeWidth="11"
              />
              {/* Foreground progress arc */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="#10b981"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
                transform="rotate(-90 70 70)"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-display text-[32px] leading-none font-bold text-ink tabular-nums">
                92
                <span className="font-sans text-[14px] font-normal text-muted-light">
                  /100
                </span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted">Risk score</p>
            </div>
          </div>

          <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-oksoft px-2.5 py-0.5 text-[11px] font-bold text-ok">
            ▲ +4 pts (30 days)
          </span>
        </div>

        {/* Right: Area Chart */}
        <div className="relative min-w-0 flex-1 w-full">
          <div className="h-[155px] w-full">
            <svg
              viewBox="0 0 380 150"
              className="h-full w-full overflow-visible"
              aria-label="Risk score trend line chart"
            >
              <defs>
                <linearGradient id="purpleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-axis labels & horizontal grid lines */}
              {[
                { val: "100", y: 15 },
                { val: "95", y: 35 },
                { val: "90", y: 55 },
                { val: "85", y: 75 },
                { val: "80", y: 95 },
                { val: "75", y: 115 },
                { val: "70", y: 135 },
              ].map((grid) => (
                <g key={grid.val}>
                  <text
                    x="24"
                    y={grid.y + 3.5}
                    textAnchor="end"
                    fill="#9ca3af"
                    fontSize="9.5"
                    fontWeight="500"
                  >
                    {grid.val}
                  </text>
                  <line
                    x1="32"
                    y1={grid.y}
                    x2="370"
                    y2={grid.y}
                    stroke="#f3f4f6"
                    strokeWidth="1"
                  />
                </g>
              ))}

              {/* Area path */}
              <path
                d="M 38 87 
                   C 70 85, 95 78, 120 75 
                   C 145 72, 170 73, 202 70 
                   C 230 67, 260 62, 285 58 
                   C 315 54, 345 50, 368 47 
                   L 368 135 L 38 135 Z"
                fill="url(#purpleAreaGrad)"
              />

              {/* Smooth curve line */}
              <path
                d="M 38 87 
                   C 70 85, 95 78, 120 75 
                   C 145 72, 170 73, 202 70 
                   C 230 67, 260 62, 285 58 
                   C 315 54, 345 50, 368 47"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="2.2"
                strokeLinecap="round"
              />

              {/* End Point Marker */}
              <circle cx="368" cy="47" r="3.5" fill="#7c3aed" />

              {/* Tooltip badge for 92 */}
              <g transform="translate(368, 30)">
                <rect
                  x="-12"
                  y="-16"
                  width="24"
                  height="16"
                  rx="4"
                  fill="#6d21e8"
                />
                <text
                  x="0"
                  y="-5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  92
                </text>
              </g>

              {/* X-axis labels */}
              {[
                { label: "Jan 1", x: 38 },
                { label: "Jan 8", x: 120 },
                { label: "Jan 15", x: 202 },
                { label: "Jan 22", x: 285 },
                { label: "Jan 29", x: 368 },
              ].map((pt) => (
                <text
                  key={pt.label}
                  x={pt.x}
                  y="147"
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="9.5"
                  fontWeight="500"
                >
                  {pt.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Summary Stats */}
      <div className="mt-5 grid grid-cols-3 border-t border-line-soft pt-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
            <span>Vulnerabilities</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[17px] font-bold text-ink">17</span>
            <span className="text-[11.5px] font-bold text-ok">▼ −6</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
            <span>License issues</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[17px] font-bold text-ink">9</span>
            <span className="text-[11.5px] font-bold text-ok">▼ −2</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            <span>SBOM coverage</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[17px] font-bold text-ink">98%</span>
            <span className="text-[11.5px] font-bold text-ok">▲ +2 pp</span>
          </div>
        </div>
      </div>
    </article>
  );
}
