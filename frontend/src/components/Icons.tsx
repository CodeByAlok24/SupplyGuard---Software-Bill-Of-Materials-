import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ShieldMark({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 2.6 4.4 5.7v5.6c0 4.8 3.2 8.4 7.6 10.1 4.4-1.7 7.6-5.3 7.6-10.1V5.7L12 2.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m8.9 11.6 2.1 2.1 4.2-4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m6 10.2 2.7 2.7L14.4 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M4 10h12M11 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertTriangleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 4 2.7 20h18.6L12 4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 10v4.2M12 17.2v.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InfoIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 11v5M12 7.7v.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M3.5 10.2 12 3.5l8.5 6.7V20a.5.5 0 0 1-.5.5h-5.4v-6H9.4v6H4a.5.5 0 0 1-.5-.5v-9.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LayersIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m12 3 9 5-9 5-9-5 9-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m3 12.5 9 5 9-5M3 17l9 5 9-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileTextIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M6 2.8h8.6L19.2 7v14.2H6V2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M14.2 3v4.3h4.6M9.2 12.5h6.8M9.2 16.3h6.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShieldIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 2.8 4.8 5.6v5.2c0 4.5 3 7.8 7.2 9.4 4.2-1.6 7.2-4.9 7.2-9.4V5.6L12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldCheckIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 2.8 4.8 5.6v5.2c0 4.5 3 7.8 7.2 9.4 4.2-1.6 7.2-4.9 7.2-9.4V5.6L12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m9 11.7 2.2 2.2 4.1-4.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertCircleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.8v5M12 16.4v.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckCircleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m8.4 12.2 2.5 2.5 4.7-4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SlidersIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="15" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function SettingsIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.3 2.3M16.4 16.4l2.3 2.3M18.7 5.3l-2.3 2.3M7.6 16.4l-2.3 2.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FolderIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.6l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5V7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CodeIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScaleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 3.5v17M7.5 20.5h9M4 7h16"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4 7 1.8 13.2a3.1 3.1 0 0 0 4.4 0L4 7ZM20 7l-2.2 6.2a3.1 3.1 0 0 0 4.4 0L20 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BarChartIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M4 20v-8M10 20V4M16 20v-6M3 20h18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HelpCircleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.5 9.2a2.6 2.6 0 0 1 5.1.8c0 1.7-2.6 2.2-2.6 3.9M12 17v.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CalendarIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 9.5h17M8 2.8v4M16 2.8v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlayIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M8.5 5.8v12.4c0 .5.6.8 1 .5l9.2-6.2a.6.6 0 0 0 0-1L9.5 5.3a.6.6 0 0 0-1 .5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrendingUpIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m3 17 6-6 4 4 7-7M15 8h6v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m16.2 16.2 4.3 4.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoreHorizontalIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function MenuIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M4 6.5h16M4 12h16M4 17.5h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function XIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CubeIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m4 7.4 8 4.6 8-4.6M12 12v9.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline points="17 8 12 3 7 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EyeIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M1 12s2-8 5-8 5 8 5 8-2 8-5 8-5-8-5-8H4c-.6 0-1 .4-1.3.9l-.5 1.6a.5.5 0 0 1-.3.9l-.5-1.6A6.5 6.5 0 0 1 1 12s2-8 5-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GithubIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 2l3.29 6.86L16.71 3c-.43-.44-1.13-.46-1.57-.26L9 9.37l-1.06 1.91L5.49 5.36c-.44-.45-.93-.77-1.57-.7L3 3.1c-.44-.43-.78-.72-.95-.82L1 1M3.63 5.28l1.18 1.89L5.36 9.92l.08.1c.19.07.4.07.58.03l1.82-1.35c.39-.3.82-.5 1.2-.5.38 0 .71.1.95.28l.07.18c.03.19.06.42.03.56l-1.77 2.13L1 18h4l2-3h7l2 3h4l-1.06-1.91.09-.16c.05-.1.04-.36-.04-.5L3.63 5.28z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloudUploadIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline points="17 8 12 3 7 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowLeftIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function RefreshCwIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline points="12 3 12 12 15 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BuildingIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M10 18l3-3m5 0l3-3m-10 6l3 3L7 7l-3 3m5 0h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClockIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline points="12 6 12 12 16 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EyeOffIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line x1="15" y1="9" x2="9" y2="15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GitForkIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M14 7a2 2 0 0 1 2 2h4a2 2 0 0 1 2-2v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h4a2 2 0 0 1-2-2v-4a2 2 0 0 1-2-2h-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5 7a2 2 0 0 0-2 2h4a2 2 0 0 0 2 2v4a2 2 0 0 0 2-2h4a2 2 0 0 0-2-2v-4a2 2 0 0 0-2-2h-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GoogleIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M23 7l-9-9a5.5 5.5 0 0 0-4.25 1.39L16 6.22l5.78 4.38a5.5 5.5 0 0 0 1.07 1.88l2.18-.55a5.5 5.5 0 0 0 .58-.97l-5.48-3.68a5.5 5.5 0 0 0-1.73-.91l-1.12-2.07L3.5 5.22a5.5 5.5 0 0 0-4.65 1.26L.73 9.05l4.36 3.28L5 14l4.58 2.06a5.5 5.5 0 0 0 1.16 1.61l-.37 1.53l3.1 3.90L3.41 21.45l4.67-2.87a5.5 5.5 0 0 0 1.13-1.08l-.09-1.52L6.17 15.5l3.03 3.91a5.5 5.5 0 0 0 .86 1.51l-.46 1.8a5.5 5.5 0 0 0 .6 2.21l2.66-.15a5.5 5.5 0 0 0 1.24-.11l.93 4.36a5.5 5.5 0 0 0 1.83.6l3.03-1.81a5.5 5.5 0 0 0 .96-1.18l-.53-2.48l-.43 2.19a5.5 5.5 0 0 0 .37 1.95l3.38.76l3.89-4.0a5.5 5.5 0 0 0-.87-1.46l-.46-2.12l-.67.96a5.5 5.5 0 0 0-.17.75l.56 2.08a5.5 5.5 0 0 0 .54.93l2.19-.08a5.5 5.5 0 0 0 .87.6l2.38-1.83a5.5 5.5 0 0 0 .37-1.23l-2.66.15a5.5 5.5 0 0 0-.7.92l-.74 2.63l2.02 3.65a5.5 5.5 0 0 0 1.16.6l-.82 2.26l.83 3.37a5.5 5.5 0 0 0 .76 1.65l2.29-.7a5.5 5.5 0 0 0-.33-1.08l.08-2.36l-.83-3.15a5.5 5.5 0 0 0-.77-1.5l.54-2.48a5.5 5.5 0 0 0-.33-1.23l-2.76.15a5.5 5.5 0 0 0-.68.73l.61 2.29a5.5 5.5 0 0 0 .73.71l1.68-.6a5.5 5.5 0 0 0 .6-.58l-.89 2.53a5.5 5.5 0 0 0 1.13.46l.91 2.77a5.5 5.5 0 0 0 1.4.28l2.54-.08a5.5 5.5 0 0 0 1.08-.57l.89-2.53a5.5 5.5 0 0 0-.18-.88l-.91-2.77a5.5 5.5 0 0 0-1.4-.28l-.82 2.15a5.5 5.5 0 0 0 .09.62l.66 2.07a5.5 5.5 0 0 0 .62.38l.88 2.41a5.5 5.5 0 0 0 .48.93l.65 2.17a5.5 5.5 0 0 0 .23.7l.66 2.22a5.5 5.5 0 0 0 .54.65l2.38-.15a5.5 5.5 0 0 0 .81-.23l.6-.08a5.5 5.5 0 0 0 .28-.55l-.66-2.07a5.5 5.5 0 0 0-.52-.55l-.67-2.07l-.86-2.3a5.5 5.5 0 0 0-.48-.6l-.89-.97a5.5 5.5 0 0 0-.53-.32l-.81-2.53a5.5 5.5 0 0 0-.74-1.11l-.52-2.06l-.88-2.18a5.5 5.5 0 0 0-.71-1.08l-.56-2.31l-.83-3.19a5.5 5.5 0 0 0-.78-1.22l-.54-2.17l-.83-3.14a5.5 5.5 0 0 0-.78-1.14l.09-2.27l-.83-3.15a5.5 5.5 0 0 0-.77-1.11l-.53-2.08l-.83-3.14a5.5 5.5 0 0 0-.77-1.07l.09-2.26l-.83-3.14a5.5 5.5 0 0 0-.77-1.05l.09-2.26l-.83-3.14a5.5 5.5 0 0 0-.77-1.02l.09-2.26l-.83-3.14a5.5 5.5 0 0 0-.77-.98l.09-2.25l-.83-3.13a5.5 5.5 0 0 0-.77-.91l.09-2.25l-.83-3.13a5.5 5.5 0 0 0-.77-.83l.09-2.25l-.83-3.13a5.5 5.5 0 0 0-.77-.74l.09-2.25l-.83-3.12a5.5 5.5 0 0 0-.77-.65l.09-2.25l-.83-3.12a5.5 5.5 0 0 0-.77-.55l.09-2.25l-.83-3.11a5.5 5.5 0 0 0-.77-.43l.09-2.25l-.83-3.10a5.5 5.5 0 0 0-.77-.3l.09-2.25l-.83-3.09a5.5 5.5 0 0 0-.77-.17l.09-2.25l-.83-3.08a5.5 5.5 0 0 0-.77-.02l.09-2.25l-.83-3.07a5.5 5.5 0 0 0-.77.03l.09-2.25l-.83-3.06a5.5 5.5 0 0 0-.77.07l.09-2.25l-.83-3.05a5.5 5.5 0 0 0-.77.13l.09-2.25l-.83-3.04a5.5 5.5 0 0 0-.77.07l.09-2.25l-.83-3.03a5.5 5.5 0 0 0-.77.17l.09-2.25l-.83-3.02a5.5 5.5 0 0 0-.77.23l.09-2.25l-.83-3.01a5.5 5.5 0 0 0-.77.3l.09-2.25l-.83-2.99a5.5 5.5 0 0 0-.77.37l.09-2.25l-.83-2.98a5.5 5.5 0 0 0-.77.43l.09-2.25l-.83-2.97a5.5 5.5 0 0 0-.77.48l.09-2.25l-.83-2.96a5.5 5.5 0 0 0-.77.55l.09-2.25l-.83-2.95a5.5 5.5 0 0 0-.77.6l.09-2.25l-.83-2.94a5.5 5.5 0 0 0-.77.65l.09-2.25l-.83-2.93a5.5 5.5 0 0 0-.77.7l.09-2.25l-.83-2.92a5.5 5.5 0 0 0-.77.75l.09-2.25l-.83-2.91a5.5 5.5 0 0 0-.77.77l.09-2.25l-.83-2.9a5.5 5.5 0 0 0-.77.77l.09-2.25l-.83-2.89a5.5 5.5 0 0 0-.77.8l.09-2.25l-.83-2.88a5.5 5.5 0 0 0-.77.83l.09-2.25l-.83-2.87a5.5 5.5 0 0 0-.77.87l.09-2.25l-.83-2.86a5.5 5.5 0 0 0-.77.9l.09-2.25l-.83-2.85a5.5 5.5 0 0 0-.77.92l.09-2.25l-.83-2.84a5.5 5.5 0 0 0-.77.97l.09-2.25l-.83-2.83a5.5 5.5 0 0 0-.77.99l.09-2.25l-.83-2.82a5.5 5.5 0 0 0-.77.88l.09-2.25l-.83-2.81a5.5 5.5 0 0 0-.77.9l.09-2.25l-.83-2.8a5.5 5.5 0 0 0-.77.92l.09-2.25l-.83-2.79a5.5 5.5 0 0 0-.77.82l.09-2.25l-.83-2.78a5.5 5.5 0 0 0-.77.8l.09-2.25l-.83-2.77a5.5 5.5 0 0 0-.77.78l.09-2.25l-.83-2.76a5.5 5.5 0 0 0-.77.75l.09-2.25l-.83-2.75a5.5 5.5 0 0 0-.77.72l.09-2.25l-.83-2.74a5.5 5.5 0 0 0-.77.7l.09-2.25l-.83-2.73a5.5 5.5 0 0 0-.77.68l.09-2.25l-.83-2.72a5.5 5.5 0 0 0-.77.65l.09-2.25l-.83-2.71a5.5 5.5 0 0 0-.77.62l.09-2.25l-.83-2.7a5.5 5.5 0 0 0-.77.58l.09-2.25l-.83-2.69a5.5 5.5 0 0 0-.77.55l.09-2.25l-.83-2.68a5.5 5.5 0 0 0-.77.5l.09-2.25l-.83-2.67a5.5 5.5 0 0 0-.77.48l.09-2.25l-.83-2.66a5.5 5.5 0 0 0-.77.45l.09-2.25l-.83-2.65a5.5 5.5 0 0 0-.77.42l.09-2.25l-.83-2.64a5.5 5.5 0 0 0-.77.38l.09-2.25l-.83-2.63a5.5 5.5 0 0 0-.77.32l.09-2.25l-.83-2.62a5.5 5.5 0 0 0-.77.28l.09-2.25l-.83-2.61a5.5 5.5 0 0 0-.77.25l.09-2.25l-.83-2.6a5.5 5.5 0 0 0-.77.35l.09-2.25l-.83-2.62a5.5 5.5 0 0 0-.77.3l.09-2.25l-.83-2.6a5.5 5.5 0 0 0-.77.27l.09-2.25l-.83-2.6a5.5 5.5 0 0 0-.77.2l.09-2.25l-.83-2.59a5.5 5.5 0 0 0-.77.2l.09-2.25l-.83-2.58a5.5 5.5 0 0 0-.77.18l.09-2.25l-.83-2.57a5.5 5.5 0 0 0-.77.13l.09-2.25l-.83-2.56a5.5 5.5 0 0 0-.77.08l.09-2.25l-.83-2.55a5.5 5.5 0 0 0-.77.03l.09-2.25l-.83-2.54a5.5 5.5 0 0 0-.77-0l.09-2.25l-.83-2.53a5.5 5.5 0 0 0-.77-0.07l.09-2.25l-.83-2.52a5.5 5.5 0 0 0-.77-0.12l.09-2.25l-.83-2.51a5.5 5.5 0 0 0-.77-0.17l.09-2.25l-.83-2.5a5.5 5.5 0 0 0-.77-0.22l.09-2.25l-.83-2.49a5.5 5.5 0 0 0-.77-0.25l.09-2.25l-.83-2.48a5.5 5.5 0 0 0-.77-0.3l.09-2.25l-.83-2.47a5.5 5.5 0 0 0-.77-0.35l.09-2.25l-.83-2.46a5.5 5.5 0 0 0-.77-0.4l.09-2.25l-.83-2.45a5.5 5.5 0 0 0-.77-0.45l.09-2.25l-.83-2.44a5.5 5.5 0 0 0-.77-0.5l.09-2.25l-.83-2.43a5.5 5.5 0 0 0-.77-0.55l.09-2.25l-.83-2.42a5.5 5.5 0 0 0-.77-0.6l.09-2.25l-.83-2.41a5.5 5.5 0 0 0-.77-0.65l.09-2.25l-.83-2.4a5.5 5.5 0 0 0-.77-0.7l.09-2.25l-.83-2.39a5.5 5.5 0 0 0-.77-0.75l.09-2.25l-.83-2.38a5.5 5.5 0 0 0-.77-0.8l.09-2.25l-.83-2.37a5.5 5.5 0 0 0-.77-0.85l.09-2.25l-.83-2.36a5.5 5.5 0 0 0-.77-0.9l.09-2.25l-.83-2.35a5.5 5.5 0 0 0-.77-0.95l.09-2.25l-.83-2.35a5.5 5.5 0 0 0-.77-1l.09-2.25l-.83-2.34a5.5 5.5 0 0 0-.77-1.05l.09-2.25l-.83-2.33a5.5 5.5 0 0 0-.77-1.08l.09-2.25l-.83-2.32a5.5 5.5 0 0 0-.77-1.1l.09-2.25l-.83-2.31a5.5 5.5 0 0 0-.77-1.13l.09-2.25l-.83-2.3a5.5 5.5 0 0 0-.77-1.15l.09-2.25l-.83-2.29a5.5 5.5 0 0 0-.77-1.17l.09-2.25l-.83-2.28a5.5 5.5 0 0 0-.77-1.18l.09-2.25l-.83-2.27a5.5 5.5 0 0 0-.77-1.17l.09-2.25l-.83-2.26a5.5 5.5 0 0 0-.77-1.17l.09-2.25l-.83-2.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScanIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M8.5 5.8v12.4c0 .5.6.8 1 .5l9.2-6.2a.6.6 0 0 0 0-1L9.5 5.3a.6.6 0 0 0-1 .5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldMarkFilled({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 2.4 4.2 5.6v5.7c0 4.9 3.3 8.6 7.8 10.3 4.5-1.7 7.8-5.4 7.8-10.3V5.6L12 2.4Z"
        fill="currentColor"
      />
      <path
        d="m8.8 11.6 2.2 2.2 4.3-4.3"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UploadIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline points="17 8 12 3 7 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
