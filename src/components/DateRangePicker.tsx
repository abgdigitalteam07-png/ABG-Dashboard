import { useState } from "react";
import { format, startOfDay, subDays, startOfMonth, startOfYear, subYears, endOfYear } from "date-fns";
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

type PresetId = "last7" | "last14" | "last30" | "last60" | "last90" | "last365" | "thisYear" | "lastYear" | "custom";

const presets: { id: PresetId; label: string }[] = [
  { id: "last7", label: "Last 7 days" },
  { id: "last14", label: "Last 14 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "last60", label: "Last 60 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "last365", label: "Last 365 days" },
  { id: "thisYear", label: "This year" },
  { id: "lastYear", label: "Last year" },
  { id: "custom", label: "Custom range" },
];

function getPresetRange(id: PresetId): { from: Date; to: Date } | null {
  const now = new Date();
  const today = startOfDay(now);
  switch (id) {
    case "last7": return { from: subDays(today, 7), to: now };
    case "last14": return { from: subDays(today, 14), to: now };
    case "last30": return { from: subDays(today, 30), to: now };
    case "last60": return { from: subDays(today, 60), to: now };
    case "last90": return { from: subDays(today, 90), to: now };
    case "last365": return { from: subDays(today, 365), to: now };
    case "thisYear": return { from: startOfYear(now), to: now };
    case "lastYear": { const ly = subYears(now, 1); return { from: startOfYear(ly), to: endOfYear(ly) }; }
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
