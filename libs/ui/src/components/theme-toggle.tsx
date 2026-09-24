'use client';

import * as React from 'react';
import { cn } from '@nestposts/ui/lib/utils';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  const { resolvedTheme, setTheme } = useTheme();

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-pressed={mounted ? isDark : undefined}
      aria-label="Alternar tema claro e escuro"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full',
        'text-muted-foreground transition-colors duration-300',
        'hover:bg-foreground/5 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      <span className="relative block size-[18px]">
        <SunIcon
          aria-hidden="true"
          className={cn(
            'absolute inset-0 size-[18px] transition-all duration-300',
            mounted && !isDark
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-50 opacity-0',
          )}
        />
        <MoonIcon
          aria-hidden="true"
          className={cn(
            'absolute inset-0 size-[18px] transition-all duration-300',
            mounted && isDark
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-50 opacity-0',
          )}
        />
      </span>
    </button>
  );
}
