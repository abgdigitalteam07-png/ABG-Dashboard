import { useEffect, useState } from "react";
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
  differenceInCalendarDays,
} from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}

type PresetId =
  | "allTime"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "thisYear"
  | "lastYear"
  | "last7"
  | "last14"
  | "last30"
  | "last60"
  | "last90"
  | "last365"
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
    case "allTime":
      return { from: new Date("2010-01-01T00:00:00Z"), to: now };
    case "today":
      return { from: today, to: now };
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: y, to: today };
    }
    case "thisWeek":
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: now };
    case "lastWeek": {
      const lw = subWeeks(today, 1);
      return {
        from: startOfWeek(lw, { weekStartsOn: 1 }),
        to: endOfWeek(lw, { weekStartsOn: 1 }),
      };
    }
    case "thisMonth":
      return { from: startOfMonth(now), to: now };
    case "lastMonth": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "thisQuarter":
      return { from: startOfQuarter(now), to: now };
    case "lastQuarter": {
      const lq = subQuarters(now, 1);
      return { from: startOfQuarter(lq), to: endOfQuarter(lq) };
    }
    case "thisYear":
      return { from: startOfYear(now), to: now };
    case "lastYear": {
      const ly = subYears(now, 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    }
    case "last7":
      return { from: subDays(today, 7), to: now };
    case "last14":
      return { from: subDays(today, 14), to: now };
    case "last30":
      return { from: subDays(today, 30), to: now };
    case "last60":
      return { from: subDays(today, 60), to: now };
    case "last90":
      return { from: subDays(today, 90), to: now };
    case "last365":
      return { from: subDays(today, 365), to: now };
    default:
      return null;
  }
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("last60");
  const [range, setRange] = useState<{ from: Date; to?: Date }>({ from, to });

  useEffect(() => {
    setRange({ from, to });
  }, [from, to]);

  const handlePreset = (id: PresetId) => {
    setSelectedPreset(id);
    const r = getPresetRange(id);
    if (r) {
      setRange({ from: r.from, to: r.to });
      onChange(r.from, r.to);
      setOpen(false);
    }
  };

  const presetLabel =
    ALL_PRESETS.find((p) => p.id === selectedPreset)?.label ?? "Custom range";

  const isSelecting = range.from && !range.to;

  const dayCount =
    range.from && range.to
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
          <span className="text-primary-foreground/35 select-none">·</span>
          <span className="text-primary-foreground/60 tabular-nums">
            {format(from, "MMM d")} – {format(to, "MMM d, yyyy")}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-60 ml-0.5 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[800px] p-0 shadow-xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Date Range</span>
          </div>
          <div className="flex items-center gap-3">
            {isSelecting && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 animate-pulse">
                Pick an end date
              </span>
            )}
            <div className="flex items-center gap-1.5 rounded-lg bg-background border border-border px-3 py-1.5 text-xs shadow-sm">
              <span className="font-semibold text-foreground tabular-nums">
                {format(range.from, "MMM d, yyyy")}
              </span>
              <span className="text-muted-foreground/60 mx-0.5">→</span>
              <span className="font-semibold text-foreground tabular-nums">
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

        <div className="flex">
          {/* ── Preset sidebar ── */}
          <div className="w-52 border-r border-border py-3 overflow-y-auto" style={{ maxHeight: 380 }}>
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
                      "flex w-full items-center gap-2.5 rounded-md mx-1.5 px-2.5 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-muted",
                      selectedPreset === preset.id
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground"
                    )}
                    style={{ width: "calc(100% - 12px)" }}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0 transition-all duration-150",
                        selectedPreset === preset.id
                          ? "bg-primary scale-125"
                          : "bg-border"
                      )}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            ))}

            {/* Custom range option */}
            <div className="border-t border-border mt-2 pt-2">
              <button
                onClick={() => setSelectedPreset("custom")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md mx-1.5 px-2.5 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-muted",
                  selectedPreset === "custom"
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground"
                )}
                style={{ width: "calc(100% - 12px)" }}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0 transition-all duration-150",
                    selectedPreset === "custom"
                      ? "bg-primary scale-125"
                      : "bg-border"
                  )}
                />
                Custom range
              </button>
            </div>
          </div>

          {/* ── Calendar ── */}
          <div className="flex-1 p-3">
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(selectedRange) => {
                if (!selectedRange?.from) return;
                setSelectedPreset("custom");
                setRange({ from: selectedRange.from, to: selectedRange.to });
                if (selectedRange.to) {
                  onChange(selectedRange.from, selectedRange.to);
                  setOpen(false);
                }
              }}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border px-4 py-2.5 bg-muted/20 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {isSelecting
              ? "Click a date on the calendar to complete the range"
              : "Select a preset or click dates on the calendar"}
          </p>
          <button
            onClick={() => setOpen(false)}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
