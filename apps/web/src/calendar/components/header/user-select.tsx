import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@nestposts/ui/components/ui/avatar';
import { AvatarGroup } from '@nestposts/ui/components/ui/avatar-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';

import { ALL_USERS, useCalendar } from '@/calendar/contexts/calendar-context';
import type { IUser } from '@/calendar/interfaces';

function UserAvatar({ user }: { user: IUser }) {
  return (
    <Avatar className="size-6">
      <AvatarImage src={user.image ?? undefined} alt={user.name} />
      <AvatarFallback className="text-[10px]">{user.name[0]}</AvatarFallback>
    </Avatar>
  );
}

export function UserSelect() {
  const { users, selectedUserId, setSelectedUserId } = useCalendar();

  const items = [
    { value: ALL_USERS, label: 'Todos' },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  return (
    <Select
      items={items}
      value={selectedUserId}
      onValueChange={(userId) => userId && setSelectedUserId(userId)}
    >
      <SelectTrigger className="flex-1 md:w-48">
        <SelectValue />
      </SelectTrigger>

      <SelectContent align="end">
        <SelectItem value={ALL_USERS}>
          <div className="flex items-center gap-1">
            <AvatarGroup max={2}>
              {users.map((user) => (
                <UserAvatar key={user.id} user={user} />
              ))}
            </AvatarGroup>
            Todos
          </div>
        </SelectItem>

        {users.map((user) => (
          <SelectItem key={user.id} value={user.id} className="flex-1">
            <div className="flex items-center gap-2">
              <UserAvatar user={user} />
              <p className="truncate">{user.name}</p>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
