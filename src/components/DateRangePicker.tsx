import { useEffect, useState } from "react";
import {
  endOfMonth, endOfQuarter, endOfWeek, endOfYear,
  format, setMonth, setYear,
  startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear,
  subDays, subMonths, subQuarters, subWeeks, subYears,
  differenceInCalendarDays,
} from "date-fns";
import type { CaptionProps } from "react-day-picker";
import { useNavigation } from "react-day-picker";
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}

type PresetId =
  | "allTime" | "today" | "yesterday"
  | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth"
  | "thisQuarter" | "lastQuarter" | "thisYear" | "lastYear"
  | "last7" | "last14" | "last30" | "last60" | "last90" | "last365"
  | "custom";

interface PresetGroup {
  label: string;
  items: { id: PresetId; label: string }[];
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    label: "Last N Days",
    items: [
      { id: "last7", label: "Last 7 days" },
      { id: "last14", label: "Last 14 days" },
      { id: "last30", label: "Last 30 days" },
      { id: "last60", label: "Last 60 days" },
      { id: "last90", label: "Last 90 days" },
      { id: "last365", label: "Last 365 days" },
    ],
  },
  {
    label: "Quick",
    items: [
      { id: "today", label: "Today" },
      { id: "yesterday", label: "Yesterday" },
    ],
  },
  {
    label: "Relative",
    items: [
      { id: "thisWeek", label: "This week" },
      { id: "lastWeek", label: "Last week" },
      { id: "thisMonth", label: "This month" },
      { id: "lastMonth", label: "Last month" },
      { id: "thisQuarter", label: "This quarter" },
      { id: "lastQuarter", label: "Last quarter" },
      { id: "thisYear", label: "This year" },
      { id: "lastYear", label: "Last year" },
    ],
  },
];

const ALL_PRESETS = PRESET_GROUPS.flatMap((g) => g.items).concat([
  { id: "custom" as PresetId, label: "Custom range" },
]);

function getPresetRange(id: PresetId): { from: Date; to: Date } | null {
  const now = new Date();
  const today = startOfDay(now);
  switch (id) {
    case "allTime": return { from: new Date("2010-01-01T00:00:00Z"), to: now };
    case "today": return { from: today, to: now };
    case "yesterday": { const y = subDays(today, 1); return { from: y, to: today }; }
    case "thisWeek": return { from: startOfWeek(today, { weekStartsOn: 1 }), to: now };
    case "lastWeek": { const lw = subWeeks(today, 1); return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }; }
    case "thisMonth": return { from: startOfMonth(now), to: now };
    case "lastMonth": { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
    case "thisQuarter": return { from: startOfQuarter(now), to: now };
    case "lastQuarter": { const lq = subQuarters(now, 1); return { from: startOfQuarter(lq), to: endOfQuarter(lq) }; }
    case "thisYear": return { from: startOfYear(now), to: now };
    case "lastYear": { const ly = subYears(now, 1); return { from: startOfYear(ly), to: endOfYear(ly) }; }
    case "last7": return { from: subDays(today, 7), to: now };
    case "last14": return { from: subDays(today, 14), to: now };
    case "last30": return { from: subDays(today, 30), to: now };
    case "last60": return { from: subDays(today, 60), to: now };
    case "last90": return { from: subDays(today, 90), to: now };
    case "last365": return { from: subDays(today, 365), to: now };
    default: return null;
  }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => 2020 + i);

/* ── Custom calendar caption with month + year dropdowns ── */
function CustomCaption({ displayMonth }: CaptionProps) {
  const { goToMonth, nextMonth, previousMonth, displayMonths } = useNavigation();

  const isFirst = displayMonths[0]?.getTime() === displayMonth.getTime();
  const isLast  = displayMonths[displayMonths.length - 1]?.getTime() === displayMonth.getTime();

  const navBtn = "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-between px-1 pb-2">
      {/* Left arrow — only on the first calendar */}
      {isFirst ? (
        <button
          onClick={() => previousMonth && goToMonth(previousMonth)}
          disabled={!previousMonth}
          className={navBtn}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-7" />
      )}

      {/* Month + Year selects */}
      <div className="flex items-center gap-1.5">
        {/* Month */}
        <div className="relative">
          <select
            value={displayMonth.getMonth()}
            onChange={(e) => goToMonth(setMonth(displayMonth, Number(e.target.value)))}
            className={cn(
              "appearance-none cursor-pointer rounded-md border border-border bg-muted/60",
              "pl-2.5 pr-6 py-1 text-sm font-semibold text-foreground",
              "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            )}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>

        {/* Year */}
        <div className="relative">
          <select
            value={displayMonth.getFullYear()}
            onChange={(e) => goToMonth(setYear(displayMonth, Number(e.target.value)))}
            className={cn(
              "appearance-none cursor-pointer rounded-md border border-border bg-muted/60",
              "pl-2.5 pr-6 py-1 text-sm font-semibold text-foreground",
              "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            )}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      {/* Right arrow — only on the last calendar */}
      {isLast ? (
        <button
          onClick={() => nextMonth && goToMonth(nextMonth)}
          disabled={!nextMonth}
          className={navBtn}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-7" />
      )}
    </div>
  );
}

type SelectionPhase = "start" | "end";

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("last60");
  const [range, setRange] = useState<{ from: Date; to?: Date }>({ from, to });
  const [phase, setPhase] = useState<SelectionPhase>("start");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  // Separate navigation month so goToMonth isn't overridden by the controlled range.from
  const [calendarMonth, setCalendarMonth] = useState<Date>(from);

  useEffect(() => { setRange({ from, to }); }, [from, to]);
  useEffect(() => {
    if (open) {
      setPhase("start");
      setCalendarMonth(from); // Reset calendar view to current range start on open
    }
  }, [open]);

  const handlePreset = (id: PresetId) => {
    setSelectedPreset(id);
    const r = getPresetRange(id);
    if (r) {
      setRange({ from: r.from, to: r.to });
      onChange(r.from, r.to);
      setOpen(false);
    }
  };

  const handleApply = () => {
    if (range.from && range.to) {
      onChange(range.from, range.to);
      setOpen(false);
      setPhase("start");
    }
  };

  const isCustom = selectedPreset === "custom";
  const presetLabel = ALL_PRESETS.find((p) => p.id === selectedPreset)?.label ?? "Custom range";

  // In "end" phase pass only from so react-day-picker waits for end click
  const calendarSelected = phase === "end"
    ? { from: range.from, to: undefined }
    : { from: range.from, to: range.to };

  const dayCount = range.from && range.to
    ? differenceInCalendarDays(range.to, range.from) + 1
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-9 gap-1.5 px-3 text-xs font-medium rounded-lg border transition-all",
            "text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground",
            "border-primary-foreground/20 hover:border-primary-foreground/40",
            open && "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/40"
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">{presetLabel}</span>
          <span className="hidden sm:inline text-primary-foreground/35 select-none">·</span>
          <span className="hidden sm:inline text-primary-foreground/60 tabular-nums">
            {format(from, "MMM d")} – {format(to, "MMM d, yyyy")}
          </span>
          <ChevronDown className={cn("h-3 w-3 opacity-60 ml-0.5 transition-transform duration-200", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[calc(100vw-16px)] sm:w-[800px] p-0 shadow-xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Date Range</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Phase hint — custom only */}
            {isCustom && (
              <span className={cn(
                "text-[11px] font-medium",
                phase === "start" ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"
              )}>
                {phase === "start" ? "① Pick a start date" : "② Pick an end date — or Apply"}
              </span>
            )}

            {/* Range badge */}
            <div className="flex items-center gap-1.5 rounded-lg bg-background border border-border px-3 py-1.5 text-xs shadow-sm">
              <span className={cn(
                "font-semibold tabular-nums",
                isCustom && phase === "start" ? "text-blue-600" : "text-foreground"
              )}>
                {format(range.from, "MMM d, yyyy")}
              </span>
              <span className="text-muted-foreground/50 mx-0.5">→</span>
              <span className={cn(
                "font-semibold tabular-nums",
                isCustom && phase === "end" ? "text-amber-600" : "text-foreground"
              )}>
                {range.to ? format(range.to, "MMM d, yyyy") : "—"}
              </span>
              {dayCount !== null && (
                <>
                  <span className="text-muted-foreground/40 mx-1">·</span>
                  <span className="text-muted-foreground font-medium">
                    {dayCount.toLocaleString()} {dayCount === 1 ? "day" : "days"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* ── Preset sidebar ── */}
          {/* Mobile: horizontal chip strip; Desktop: vertical sidebar */}
          <div className="sm:w-52 border-b sm:border-b-0 sm:border-r border-border sm:py-3">
            {/* Mobile chip strip */}
            <div className="flex sm:hidden gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {PRESET_GROUPS.flatMap((g) => g.items).concat([{ id: "custom" as PresetId, label: "Custom" }]).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => preset.id === "custom" ? (setSelectedPreset("custom"), setPhase("start")) : handlePreset(preset.id as PresetId)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedPreset === preset.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Desktop vertical list */}
            <div className="hidden sm:block overflow-y-auto" style={{ maxHeight: 400 }}>
              {PRESET_GROUPS.map((group, gi) => (
                <div key={group.label} className={cn("mb-1", gi > 0 && "mt-2")}>
                  <p className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    {group.label}
                  </p>
                  {group.items.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePreset(preset.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md mx-1.5 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                        selectedPreset === preset.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                      )}
                      style={{ width: "calc(100% - 12px)" }}
                    >
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0 transition-all",
                        selectedPreset === preset.id ? "bg-primary scale-125" : "bg-border"
                      )} />
                      {preset.label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2">
                <button
                  onClick={() => { setSelectedPreset("custom"); setPhase("start"); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md mx-1.5 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    isCustom ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  )}
                  style={{ width: "calc(100% - 12px)" }}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0 transition-all",
                    isCustom ? "bg-primary scale-125" : "bg-border"
                  )} />
                  Custom range
                </button>
              </div>
            </div>
          </div>

          {/* ── Calendar ── */}
          <div className="flex-1 p-3">
            <Calendar
              mode="range"
              selected={calendarSelected}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={(selectedRange) => {
                if (!selectedRange?.from) return;
                setSelectedPreset("custom");

                if (phase === "start") {
                  const newFrom = selectedRange.from;
                  setRange({ from: newFrom, to: endOfMonth(newFrom) });
                  setPhase("end");
                } else {
                  if (selectedRange.to) {
                    setRange({ from: range.from, to: selectedRange.to });
                  }
                }
              }}
              numberOfMonths={isMobile ? 1 : 2}
              className="pointer-events-auto"
              // Custom caption with month/year dropdowns — only in custom mode
              components={isCustom ? { Caption: CustomCaption } : undefined}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border px-4 py-2.5 bg-muted/20 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {isCustom
              ? phase === "start"
                ? "Use the Month / Year dropdowns to navigate, then click your start date"
                : "End date defaults to last day of the month — click any date to change it"
              : "Select a preset or click Custom range to pick specific dates"}
          </p>
          <div className="flex items-center gap-2">
            {isCustom && phase === "end" && range.from && range.to && (
              <button
                onClick={handleApply}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Check className="h-3 w-3" />
                Apply {format(range.from, "MMM d")} – {format(range.to, "MMM d, yyyy")}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

      </PopoverContent>
    </Popover>
  );
}
