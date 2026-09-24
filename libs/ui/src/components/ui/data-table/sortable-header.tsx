import React, { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableHead } from '@nestposts/ui/components/ui/table';
import { GripVertical } from 'lucide-react';

interface SortableHeaderProps {
  header: any;
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}

export function SortableHeader({
  header,
  children,
  colSpan,
  className,
}: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: header.id,
    disabled:
      (!header.column.getCanSort() && header.id === 'select') ||
      header.id === 'actions' ||
      header.column.columnDef.meta?.disableDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canDrag =
    header.id !== 'select' &&
    header.id !== 'actions' &&
    !header.column.columnDef.meta?.disableDrag;

  const [loaded, setLoaded] = React.useState(false);

  useEffect(() => {
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <TableHead colSpan={header.colSpan} className={className}>
        <div className="flex items-center gap-2">
          <div className="px-1 py-2">
            {canDrag && (
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">{children}</div>
        </div>
      </TableHead>
    );
  }

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      colSpan={header.colSpan}
      className={className}
    >
      <div className="flex items-center gap-2">
        <div
          className={`px-1 py-2 ${isDragging ? 'relative z-50' : ''} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
          {...(canDrag ? attributes : {})}
          {...(canDrag ? listeners : {})}
        >
          {canDrag && (
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </TableHead>
  );
}
