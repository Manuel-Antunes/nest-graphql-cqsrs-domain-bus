import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import { Users } from 'lucide-react';

import { ALL_TEAMS, useCalendar } from '@/calendar/contexts/calendar-context';

export function TeamSelect() {
  const { teams, selectedTeamId, setSelectedTeamId } = useCalendar();

  if (teams.length === 0) return null;

  const items = [
    { value: ALL_TEAMS, label: 'Todos os times' },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];

  return (
    <Select
      items={items}
      value={selectedTeamId}
      onValueChange={(teamId) => teamId && setSelectedTeamId(teamId)}
    >
      <SelectTrigger className="flex-1 md:w-48">
        <div className="flex items-center gap-2 truncate">
          <Users className="size-4 shrink-0" />
          <SelectValue placeholder="Selecione um time" />
        </div>
      </SelectTrigger>

      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="flex-1">
            <span className="truncate">{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
