'use client';

import { useState } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import { TimeInput } from '@nestposts/ui/components/ui/time-input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nestposts/ui/components/ui/tooltip';
import { Info } from 'lucide-react';
import type { TimeValue } from 'react-aria-components';

import { useCalendar } from '@/calendar/contexts/calendar-context';

export function ChangeVisibleHoursInput() {
  const { visibleHours, setVisibleHours } = useCalendar();

  const [from, setFrom] = useState<{ hour: number; minute: number }>({
    hour: visibleHours.from,
    minute: 0,
  });
  const [to, setTo] = useState<{ hour: number; minute: number }>({
    hour: visibleHours.to,
    minute: 0,
  });

  const handleApply = () => {
    const toHour = to.hour === 0 ? 24 : to.hour;
    setVisibleHours({ from: from.hour, to: toHour });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-sm">Alterar horas visíveis</p>

        <TooltipProvider delay={100}>
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3" />
            </TooltipTrigger>

            <TooltipContent className="max-w-80 text-center">
              <p>
                Se um evento estiver fora das horas visíveis definidas, as horas
                visíveis serão ajustadas automaticamente para incluí-lo.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-4">
        <p>De</p>
        <TimeInput
          id="start-time"
          hourCycle={24}
          granularity="hour"
          value={from as TimeValue}
          onChange={setFrom as (value: TimeValue | null) => void}
        />
        <p>Até</p>
        <TimeInput
          id="end-time"
          hourCycle={24}
          granularity="hour"
          value={to as TimeValue}
          onChange={setTo as (value: TimeValue | null) => void}
        />
      </div>

      <Button className="mt-4 w-fit" onClick={handleApply}>
        Aplicar
      </Button>
    </div>
  );
}
