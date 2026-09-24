import type { ButtonHTMLAttributes } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import { SingleCalendar } from '@nestposts/ui/components/ui/single-calendar';
import { useDisclosure } from '@nestposts/ui/hooks/use-disclosure';
import { cn } from '@nestposts/ui/lib/utils';
import { format } from 'date-fns';

type TProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onSelect' | 'value'
> & {
  onSelect: (value: Date | undefined) => void;
  value?: Date | undefined;
  placeholder: string;
  labelVariant?: 'P' | 'PP' | 'PPP';
};

function SingleDayPicker({
  id,
  onSelect,
  className,
  placeholder,
  labelVariant = 'PPP',
  value,
  ...props
}: TProps) {
  const { isOpen, onClose, onToggle } = useDisclosure();

  const handleSelect = (date: Date | undefined) => {
    onSelect(date);
    onClose();
  };

  return (
    <Popover open={isOpen} onOpenChange={onToggle} modal>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className={cn(
              'group relative h-9 w-full justify-start whitespace-nowrap px-3 py-2 font-normal hover:bg-inherit',
              className,
            )}
            {...props}
          />
        }
      >
        {value && <span>{format(value, labelVariant)}</span>}
        {!value && <span className="text-muted-foreground">{placeholder}</span>}
      </PopoverTrigger>

      <PopoverContent align="center" className="w-fit p-0">
        <SingleCalendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { SingleDayPicker };
