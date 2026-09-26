'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@nestposts/ui/components/ui/avatar';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@nestposts/ui/components/ui/form';
import { Input } from '@nestposts/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import { SingleDayPicker } from '@nestposts/ui/components/ui/single-day-picker';
import { Textarea } from '@nestposts/ui/components/ui/textarea';
import { TimeInput } from '@nestposts/ui/components/ui/time-input';
import type { TimeValue } from 'react-aria-components';
import { useFormContext } from 'react-hook-form';

import type { ITeam, IUser } from '@/calendar/interfaces';
import type { TEventFormData } from '@/calendar/schemas';
import type { TEventColor } from '@/calendar/types';
import { cn } from '@/lib/utils';

export const EVENT_COLOR_OPTIONS: ReadonlyArray<{
  value: TEventColor;
  dot: string;
  label: string;
}> = [
  { value: 'blue', dot: 'bg-primary', label: 'Azul' },
  { value: 'green', dot: 'bg-green-600', label: 'Verde' },
  { value: 'red', dot: 'bg-red-600', label: 'Vermelho' },
  { value: 'yellow', dot: 'bg-yellow-600', label: 'Amarelo' },
  { value: 'purple', dot: 'bg-purple-600', label: 'Roxo' },
  { value: 'orange', dot: 'bg-orange-600', label: 'Laranja' },
  { value: 'gray', dot: 'bg-neutral-600', label: 'Cinza' },
];

const NO_TEAM = 'none';

export interface EventFormFieldsProps {
  users: IUser[];
  teams: ITeam[];
  isAdmin: boolean;
}

function PersonLabel({
  user,
  size = 'size-6',
}: {
  user: IUser;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className={size}>
        <AvatarImage src={user.image ?? undefined} alt={user.name} />
        <AvatarFallback className="text-[10px]">{user.name[0]}</AvatarFallback>
      </Avatar>
      <p className="truncate">{user.name}</p>
    </div>
  );
}

export function EventFormFields({
  users,
  teams,
  isAdmin,
}: EventFormFieldsProps) {
  const form = useFormContext<TEventFormData>();
  const responsibleId = form.watch('user');
  const hasTeams = teams.length > 0;

  return (
    <>
      <FormField
        control={form.control}
        name="user"
        render={({ field, fieldState }) => (
          <FormItem className={hasTeams ? undefined : 'sm:col-span-2'}>
            <FormLabel>Responsável</FormLabel>
            <FormControl>
              <Select
                items={users.map((user) => ({
                  value: user.id,
                  label: user.name,
                }))}
                value={field.value}
                onValueChange={(userId) => userId && field.onChange(userId)}
                disabled={!isAdmin}
              >
                <SelectTrigger
                  className="w-full"
                  data-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Selecione uma opção" />
                </SelectTrigger>

                <SelectContent>
                  {users.map((user) => (
                    <SelectItem
                      key={user.id}
                      value={user.id}
                      className="flex-1"
                    >
                      <PersonLabel user={user} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {hasTeams && (
        <FormField
          control={form.control}
          name="teamId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time</FormLabel>
              <FormControl>
                <Select
                  items={[
                    { value: NO_TEAM, label: 'Sem time' },
                    ...teams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    })),
                  ]}
                  value={field.value ? field.value : NO_TEAM}
                  onValueChange={(teamId) =>
                    field.onChange(!teamId || teamId === NO_TEAM ? '' : teamId)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sem time" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={NO_TEAM}>Sem time</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        <span className="truncate">{team.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              {field.value ? (
                <p className="text-muted-foreground text-xs">
                  Todos os membros deste time serão adicionados como
                  participantes automaticamente.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="participantIds"
        render={({ field }) => {
          const selectedIds = field.value ?? [];
          const toggle = (id: string) =>
            field.onChange(
              selectedIds.includes(id)
                ? selectedIds.filter((participant) => participant !== id)
                : [...selectedIds, id],
            );
          const pool = users.filter((user) => user.id !== responsibleId);
          return (
            <FormItem className="sm:col-span-2">
              <FormLabel>Participantes</FormLabel>
              <div className="flex flex-wrap gap-1.5">
                {pool.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Nenhum outro membro disponível.
                  </p>
                ) : (
                  pool.map((user) => (
                    <Button
                      key={user.id}
                      type="button"
                      size="sm"
                      variant={
                        selectedIds.includes(user.id) ? 'default' : 'outline'
                      }
                      className={cn('h-7 gap-1.5 px-2')}
                      onClick={() => toggle(user.id)}
                    >
                      <PersonLabel user={user} size="size-4" />
                    </Button>
                  ))
                )}
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="title"
        render={({ field, fieldState }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel htmlFor="title">Título</FormLabel>
            <FormControl>
              <Input
                id="title"
                placeholder="Digite um título"
                data-invalid={fieldState.invalid}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-4">
        <FormField
          control={form.control}
          name="startDate"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel htmlFor="startDate">Data de início</FormLabel>
              <FormControl>
                <SingleDayPicker
                  id="startDate"
                  value={field.value}
                  onSelect={(date) => field.onChange(date as Date)}
                  placeholder="Selecione uma data"
                  data-invalid={fieldState.invalid}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="startTime"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Hora de início</FormLabel>
              <FormControl>
                <TimeInput
                  value={field.value as TimeValue}
                  onChange={field.onChange}
                  hourCycle={24}
                  data-invalid={fieldState.invalid}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endDate"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Data de término</FormLabel>
              <FormControl>
                <SingleDayPicker
                  value={field.value}
                  onSelect={(date) => field.onChange(date as Date)}
                  placeholder="Selecione uma data"
                  data-invalid={fieldState.invalid}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endTime"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Hora de término</FormLabel>
              <FormControl>
                <TimeInput
                  value={field.value as TimeValue}
                  onChange={field.onChange}
                  hourCycle={24}
                  data-invalid={fieldState.invalid}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="color"
        render={({ field, fieldState }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Cor</FormLabel>
            <FormControl>
              <Select
                items={EVENT_COLOR_OPTIONS.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                value={field.value}
                onValueChange={(color) => color && field.onChange(color)}
              >
                <SelectTrigger
                  className="w-full"
                  data-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Selecione uma opção" />
                </SelectTrigger>

                <SelectContent>
                  {EVENT_COLOR_OPTIONS.map(({ value, dot, label }) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        <div className={cn('size-3.5 rounded-full', dot)} />
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Descrição</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value}
                data-invalid={fieldState.invalid}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
