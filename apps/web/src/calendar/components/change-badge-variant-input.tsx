'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';

import { useCalendar } from '@/calendar/contexts/calendar-context';
import type { TBadgeVariant } from '@/calendar/types';

const BADGE_VARIANTS: ReadonlyArray<{ value: TBadgeVariant; label: string }> = [
  { value: 'dot', label: 'Ponto' },
  { value: 'colored', label: 'Colorido' },
  { value: 'mixed', label: 'Misto' },
];

export function ChangeBadgeVariantInput() {
  const { badgeVariant, setBadgeVariant } = useCalendar();

  return (
    <div className="space-y-2">
      <p className="font-semibold text-sm">Alterar estilo do marcador</p>

      <Select
        items={BADGE_VARIANTS}
        value={badgeVariant}
        onValueChange={(variant) => variant && setBadgeVariant(variant)}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {BADGE_VARIANTS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
