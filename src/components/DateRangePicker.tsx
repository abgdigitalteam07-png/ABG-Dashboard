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

const presets: { id: PresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "thisWeek", label: "This week" },
  { id: "lastWeek", label: "Last week" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisQuarter", label: "This quarter" },
  { id: "lastQuarter", label: "Last quarter" },
  { id: "thisYear", label: "This year" },
  { id: "lastYear", label: "Last year" },
  { id: "last7", label: "Last 7 days" },
  { id: "last14", label: "Last 14 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "last60", label: "Last 60 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "last365", label: "Last 365 days" },
  { id: "custom", label: "Custom range" },
];

function getPresetRange(id: PresetId): { from: Date; to: Date } | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (id) {
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
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("last365");
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
    }
  };

  const presetLabel = presets.find((p) => p.id === selectedPreset)?.label ?? "Last 30 days";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-2 text-xs font-medium text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span>{presetLabel}</span>
          <span className="text-primary-foreground/55">
            {format(from, "MMM d")} - {format(to, "MMM d, yyyy")}
          </span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[760px] p-0">
        <div className="flex">
          <div className="w-52 border-r border-border p-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePreset(preset.id)}
                className={cn(
                  "flex w-full rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selectedPreset === preset.id && "bg-muted font-medium text-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="p-1">
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(selectedRange) => {
                if (!selectedRange?.from) return;

                setSelectedPreset("custom");
                setRange({ from: selectedRange.from, to: selectedRange.to });

                if (selectedRange.to) {
                  onChange(selectedRange.from, selectedRange.to);
                }
              }}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
