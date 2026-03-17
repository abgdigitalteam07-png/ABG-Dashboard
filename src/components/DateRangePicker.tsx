import { useState } from "react";
import { format, startOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
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

type PresetId = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "fixed" | "advanced";

const presets: { id: PresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "fixed", label: "Fixed (custom)" },
  { id: "advanced", label: "Advanced" },
];

function getPresetRange(id: PresetId): { from: Date; to: Date } | null {
  const now = new Date();
  const today = startOfDay(now);
  switch (id) {
    case "today": return { from: today, to: now };
    case "yesterday": { const y = subDays(today, 1); return { from: y, to: today }; }
    case "last7": return { from: subDays(today, 7), to: now };
    case "last30": return { from: subDays(today, 30), to: now };
    case "thisMonth": return { from: startOfMonth(now), to: now };
    case "lastMonth": { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
    default: return null;
  }
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("last30");
  const [showCalendar, setShowCalendar] = useState(false);
  const [range, setRange] = useState<{ from: Date; to?: Date }>({ from, to });

  const handlePreset = (id: PresetId) => {
    setSelectedPreset(id);
    const r = getPresetRange(id);
    if (r) {
      onChange(r.from, r.to);
      setShowCalendar(false);
      setOpen(false);
    } else {
      // fixed or advanced → show calendar
      setShowCalendar(true);
      setRange({ from, to });
    }
  };

  const presetLabel = presets.find((p) => p.id === selectedPreset)?.label ?? "Last 30 days";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-2 text-xs font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span>{presetLabel}</span>
          <span className="text-primary-foreground/50">
            {format(from, "MMM d")} – {format(to, "MMM d, yyyy")}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="w-44 border-r border-border p-1">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePreset(p.id)}
                className={cn(
                  "flex w-full rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                  selectedPreset === p.id && "bg-muted font-medium text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {showCalendar && (
            <div className="p-0">
              <Calendar
                mode="range"
                selected={{ from: range.from, to: range.to }}
                onSelect={(r) => {
                  if (r?.from) {
                    setRange({ from: r.from, to: r.to });
                    if (r.to) {
                      onChange(r.from, r.to);
                      setOpen(false);
                      setShowCalendar(false);
                    }
                  }
                }}
                numberOfMonths={2}
                className="p-3 pointer-events-auto"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
