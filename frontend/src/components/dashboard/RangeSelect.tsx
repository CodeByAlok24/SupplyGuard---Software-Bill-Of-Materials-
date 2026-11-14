import { CalendarIcon, ChevronDownIcon } from "../Icons";

type RangeSelectProps = {
  className?: string;
};

export function RangeSelect({ className = "" }: RangeSelectProps) {
  return (
    <label
      className={`relative inline-flex items-center gap-2 rounded-lg border border-line bg-surface py-2 pr-8 pl-3 text-[12.5px] font-semibold text-ink-soft [box-shadow:0_1px_2px_rgba(25,21,36,0.03)] transition-colors hover:border-line ${className}`}
    >
      <CalendarIcon className="h-4 w-4 shrink-0 text-muted-light" />
      <span className="sr-only">Date range</span>
      <select
        defaultValue="30"
        className="cursor-pointer appearance-none bg-transparent text-[12.5px] font-semibold text-ink-soft outline-none"
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-light" />
    </label>
  );
}
