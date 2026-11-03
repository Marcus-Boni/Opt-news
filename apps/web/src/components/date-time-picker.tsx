// Date and time on shadcn primitives (Popover + Calendar + Select), in pt-BR. Values are São Paulo wall time as
// "YYYY-MM-DDTHH:mm", the same string the old datetime-local produced, so forms keep using saoPauloInputToIso.
import { CalendarDays, X } from "lucide-react";
import { useId, useState } from "react";
import { ptBR } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Hint } from "@/ui";

const SLOTS = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
const DAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fromKey(key: string): Date | undefined {
  const [y, m, d] = key.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}

export function DateTimePicker({
  id,
  name,
  min,
  required = false,
  placeholder = "Escolha a data e o horário…",
  defaultTime = "09:00",
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  name: string;
  /** Earliest allowed value, same "YYYY-MM-DDTHH:mm" format. */
  min?: string;
  required?: boolean;
  placeholder?: string;
  defaultTime?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const timeId = useId();
  const [minDay = "", minTime = "00:00"] = min?.split("T") ?? [];
  const slots = day && day === minDay ? SLOTS.filter((s) => s >= minTime) : SLOTS;
  const value = day && time ? `${day}T${time}` : "";
  const date = fromKey(day);
  const minDate = fromKey(minDay);

  const pickDay = (d: Date | undefined) => {
    const key = d ? toKey(d) : "";
    setDay(key);
    if (!key) return;
    const allowed = key === minDay ? SLOTS.filter((s) => s >= minTime) : SLOTS;
    if (!time || !allowed.includes(time)) setTime(allowed.includes(defaultTime) ? defaultTime : (allowed[0] ?? ""));
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-describedby={describedBy}
            className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")}
          >
            <CalendarDays data-icon="inline-start" />
            <span className="truncate">{date && time ? `${DAY.format(date)} · ${time}` : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={date}
            onSelect={pickDay}
            defaultMonth={date ?? minDate}
            disabled={minDate ? { before: minDate } : undefined}
            className="[--cell-size:--spacing(9)]"
          />
          <div className="flex items-end gap-2 border-t p-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={timeId} className="text-xs text-muted-foreground">
                Horário (Brasília)
              </Label>
              <Select value={time} onValueChange={setTime} disabled={!day}>
                <SelectTrigger id={timeId} className="w-full tabular">
                  <SelectValue placeholder="Escolha o horário…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectGroup>
                    {slots.map((s) => (
                      <SelectItem key={s} value={s} className="tabular">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" disabled={!value} onClick={() => setOpen(false)}>
              Pronto
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {value && !required && (
        <Hint label="Limpar data">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Limpar data"
            className="absolute top-0.5 right-0.5"
            onClick={() => {
              setDay("");
              setTime("");
            }}
          >
            <X />
          </Button>
        </Hint>
      )}
      {/* Carries the value into FormData and, when required, lets the browser block an empty submit on the trigger. */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value}
        required={required}
        onChange={() => {}}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </div>
  );
}
