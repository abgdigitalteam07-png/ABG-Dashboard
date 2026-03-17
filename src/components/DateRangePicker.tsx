import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: Date; to?: Date }>({ from, to });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-2 text-xs font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {format(from, "MMM d, yyyy")} – {format(to, "MMM d, yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={{ from: range.from, to: range.to }}
          onSelect={(r) => {
            if (r?.from) {
              setRange({ from: r.from, to: r.to });
              if (r.to) {
                onChange(r.from, r.to);
                setOpen(false);
              }
            }
          }}
          numberOfMonths={2}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
