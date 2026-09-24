import type { CSSProperties, HTMLAttributes, ReactElement, Ref } from 'react';
import { Children, cloneElement, isValidElement } from 'react';
import { cn } from '@nestposts/ui/lib/utils';

type AvatarChild = ReactElement<{
  className?: string;
  style?: CSSProperties;
}>;

type TAvatarGroupProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  max?: number;
  spacing?: number;
};

function AvatarGroup({
  ref,
  className,
  children,
  max = 1,
  spacing = 10,
  ...props
}: TAvatarGroupProps) {
  const avatarItems = Children.toArray(children).filter(
    (child): child is AvatarChild => isValidElement(child),
  );

  const visibleItems = avatarItems.slice(0, max);
  const overflowCount = avatarItems.length - max;

  return (
    <div ref={ref} className={cn('flex items-center', className)} {...props}>
      {visibleItems.map((child, index) =>
        cloneElement(child, {
          className: cn(child.props.className, 'ring-2 ring-background'),
          style: {
            ...child.props.style,
            marginLeft: index === 0 ? 0 : -spacing,
          },
        }),
      )}

      {overflowCount > 0 && (
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background',
            visibleItems[0]?.props.className,
          )}
          style={{ marginLeft: -spacing }}
        >
          <span className="font-medium text-xxs leading-none">
            +{overflowCount}
          </span>
        </div>
      )}
    </div>
  );
}

export { AvatarGroup };
