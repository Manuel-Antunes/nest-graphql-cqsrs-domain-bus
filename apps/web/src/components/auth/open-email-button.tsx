'use client';

import { useMemo } from 'react';
import {
  createQrCodeSvgData,
  getEmailProviderLink,
} from '@better-auth-ui/core';
import { useAuth } from '@better-auth-ui/react';
import { buttonVariants } from '@nestposts/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nestposts/ui/components/ui/tooltip';
import type { VariantProps } from 'class-variance-authority';
import { QrCode } from 'lucide-react';

import { cn } from '@/lib/utils';

export type OpenEmailButtonProps = {
  email: string;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
};

export function OpenEmailButton({
  email,
  className,
  variant,
}: OpenEmailButtonProps) {
  const { localization } = useAuth();

  const provider = getEmailProviderLink(email);
  const loginUrl = provider?.loginUrl;
  const qrCode = useMemo(
    () => (loginUrl ? createQrCodeSvgData(loginUrl) : null),
    [loginUrl],
  );

  if (!provider || !qrCode) return null;

  const scanLabel = localization.auth.scanToOpenEmailProvider.replace(
    '{{provider}}',
    provider.companyProvider,
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={cn(buttonVariants({ variant }), 'w-full', className)}
          onClick={() =>
            window.open(provider.loginUrl, '_blank', 'noopener,noreferrer')
          }
        >
          {localization.auth.openEmailProvider.replace(
            '{{provider}}',
            provider.companyProvider,
          )}
          <QrCode data-icon="inline-end" />
        </TooltipTrigger>
        <TooltipContent
          sideOffset={8}
          className="flex-col items-center gap-2 p-3"
        >
          <svg
            viewBox={`0 0 ${qrCode.size} ${qrCode.size}`}
            aria-hidden="true"
            focusable="false"
            className="size-40"
          >
            <path fill="white" d={`M0 0h${qrCode.size}v${qrCode.size}H0z`} />
            <path fill="black" d={qrCode.path} shapeRendering="crispEdges" />
          </svg>
          <p className="max-w-40 text-center leading-snug">{scanLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
