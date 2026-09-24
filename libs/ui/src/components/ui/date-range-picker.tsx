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
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  disabled = false,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(value?.from || new Date());

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const years = Array.from(
    { length: 100 },
    (_, i) => new Date().getFullYear() - 50 + i,
  );

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id="date"
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !value && 'text-muted-foreground',
              )}
              disabled={disabled}
            />
          }
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, 'LLL dd, y')} -
                {format(value.to, 'LLL dd, y')}
              </>
            ) : (
              format(value.from, 'LLL dd, y')
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
            autoFocus
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            month={month}
            onMonthChange={setMonth}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
