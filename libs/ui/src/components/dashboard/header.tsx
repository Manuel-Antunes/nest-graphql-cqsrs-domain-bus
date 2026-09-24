'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@nestposts/ui/lib/utils';
import { ChevronLeftIcon } from 'lucide-react';

import { Button } from '../ui/button';

interface DashboardHeaderProps {
  heading: string | React.ReactNode;
  text?: string;
  back?: boolean;
  children?: React.ReactNode;
  onBack?: () => void;
  className?: string;
  withDivider?: boolean;
}

export function DashboardHeader({
  heading,
  text,
  back,
  onBack,
  children,
  className,
  withDivider = false,
}: DashboardHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <>
      <div
        className={cn(`flex items-center justify-between ${className || ''}`)}
      >
        <div className="grid gap-1">
          <div className="flex items-start gap-4">
            {back && (
              <Button onClick={handleBack} size="icon" variant="outline">
                <ChevronLeftIcon className="size-4" />
                <span className="sr-only">Back</span>
              </Button>
            )}
            <h1 className="font-bold font-heading text-3xl tracking-tight">
              {heading}
            </h1>
          </div>
          {text && <p className="text-muted-foreground">{text}</p>}
        </div>
        {children}
      </div>
      {withDivider && <hr className="border-border" />}
    </>
  );
}
