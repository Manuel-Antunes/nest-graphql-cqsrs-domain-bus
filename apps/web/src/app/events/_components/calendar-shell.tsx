'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@nestposts/ui/components/ui/accordion';
import { Settings } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { ChangeBadgeVariantInput } from '@/calendar/components/change-badge-variant-input';
import { ChangeVisibleHoursInput } from '@/calendar/components/change-visible-hours-input';
import { CalendarProvider } from '@/calendar/contexts/calendar-context';
import { EVENTS_PATH } from '@/calendar/paths';

export function CalendarShell({
  children,
  canManage,
}: {
  children: React.ReactNode;
  canManage: boolean;
}) {
  return (
    <NuqsAdapter>
      <CalendarProvider basePath={EVENTS_PATH} canManage={canManage}>
        <div className="flex w-full flex-col gap-4">
          {children}

          <Accordion>
            <AccordionItem value="settings" className="border-none">
              <AccordionTrigger className="flex-none gap-2 py-0 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings className="size-4" />
                  <p className="font-semibold text-base">
                    Configurações do calendário
                  </p>
                </div>
              </AccordionTrigger>

              <AccordionContent>
                <div className="mt-4 flex flex-col gap-6">
                  <ChangeBadgeVariantInput />
                  <ChangeVisibleHoursInput />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CalendarProvider>
    </NuqsAdapter>
  );
}
