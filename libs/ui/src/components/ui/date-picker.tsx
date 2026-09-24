'use client';

import * as React from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import { Calendar } from '@nestposts/ui/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import { cn } from '@nestposts/ui/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecione uma data',
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(value || new Date());

  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const years = Array.from(
    { length: 100 },
    (_, i) => new Date().getFullYear() - 50 + i,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
            disabled={disabled}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? (
          format(value, 'dd MMM, yyyy', { locale: ptBR }).replace(
            /^(\d+\s)(\w)/,
            (match, day, firstLetter) => day + firstLetter.toUpperCase(),
          )
        ) : (
          <span>{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="border-b p-3">
          <div className="flex items-center justify-between space-x-2">
            <Select
              value={months[month.getMonth()]}
              onValueChange={(v) => {
                if (v === null) return;
                const newMonth = new Date(month);
                newMonth.setMonth(months.indexOf(v));
                setMonth(newMonth);
              }}
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((monthName) => (
                  <SelectItem key={monthName} value={monthName}>
                    {monthName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={month.getFullYear().toString()}
              onValueChange={(v) => {
                if (v === null) return;
                const newMonth = new Date(month);
                newMonth.setFullYear(Number.parseInt(v, 10));
                setMonth(newMonth);
              }}
            >
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (date) {
              const normalizedDate = new Date(
                date.getFullYear(),
                date.getMonth(),
                date.getDate(),
                0,
                0,
                0,
                0,
              );
              onChange?.(normalizedDate);
            } else {
              onChange?.(date);
            }
            setOpen(false);
          }}
          month={month}
          onMonthChange={setMonth}
          disabled={disabled}
          locale={ptBR}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
