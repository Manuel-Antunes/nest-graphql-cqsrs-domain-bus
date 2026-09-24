'use client';

import * as React from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import { Calendar } from '@nestposts/ui/components/ui/calendar';
import { Input } from '@nestposts/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import { cn } from '@nestposts/ui/lib/utils';
import { isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

interface DatePickerSubscriptionProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  triggerClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function applyDateMask(value: string): string {
  const numbers = value.replace(/\D/g, '');

  if (numbers.length <= 2) {
    return numbers;
  }
  if (numbers.length <= 4) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
  }
  return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
}

function parseDateBR(value: string): Date | undefined {
  if (value.length !== 10) return undefined;

  const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
  return isValid(parsedDate) ? parsedDate : undefined;
}

export default function DatePickerSubscription({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  triggerClassName = '',
  disabled = false,
  className,
}: DatePickerSubscriptionProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(value || new Date());
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (value) {
      setInputValue(value.toLocaleDateString('pt-BR', { timeZone: 'UTC' }));
      setMonth(value);
      setError(false);
    } else {
      setInputValue('');
      setError(false);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const maskedValue = applyDateMask(rawValue);

    setInputValue(maskedValue);

    if (maskedValue.length === 10) {
      const parsedDate = parseDateBR(maskedValue);

      if (parsedDate) {
        const normalizedDate = new Date(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate(),
          0,
          0,
          0,
          0,
        );
        setMonth(normalizedDate);
        setError(false);
        onChange?.(normalizedDate);
      } else {
        setError(true);
      }
    } else {
      setError(false);
    }
  };

  const handleInputBlur = () => {
    if (inputValue.length > 0 && inputValue.length < 10) {
      if (value) {
        setInputValue(value.toLocaleDateString('pt-BR', { timeZone: 'UTC' }));
      } else {
        setInputValue('');
      }
      setError(false);
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const normalizedDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        0,
        0,
        0,
        0,
      );
      onChange?.(normalizedDate);
    } else {
      onChange?.(undefined);
    }
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id="date"
          value={inputValue}
          placeholder={placeholder}
          className={cn(
            'bg-background pr-10 font-mono',
            error && 'border-red-500 focus-visible:ring-red-500',
            className,
          )}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          maxLength={10}
          autoComplete="off"
          disabled={disabled}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                id="date-picker"
                type="button"
                variant="ghost"
                className={cn(
                  'absolute top-0 right-0 h-full px-3 hover:bg-transparent',
                  triggerClassName,
                )}
                disabled={disabled}
              />
            }
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Selecionar data</span>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              selected={value}
              captionLayout="dropdown"
              month={month}
              onMonthChange={setMonth}
              onSelect={handleCalendarSelect}
              locale={ptBR}
              disabled={disabled}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {error && (
        <p className="absolute -bottom-5 left-0 text-destructive text-xs">
          Data inválida. Use o formato dd/mm/aaaa
        </p>
      )}
    </div>
  );
}
