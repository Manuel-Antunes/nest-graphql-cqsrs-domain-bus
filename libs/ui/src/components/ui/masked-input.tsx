import React, { useEffect, useRef } from 'react';
import { Input } from '@nestposts/ui/components/ui/input';
import { cn } from '@nestposts/ui/lib/utils';
import { withMask } from 'use-mask-input';

interface MaskedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  mask: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  maskOptions?: Parameters<typeof withMask>[1];
}

export const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, className, maskOptions, ...props }, forwardedRef) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (inputRef.current) {
        withMask(mask, maskOptions)(inputRef.current);
      }
    }, [mask]);

    React.useImperativeHandle(forwardedRef, () => inputRef.current!);

    return <Input ref={inputRef} className={cn(className)} {...props} />;
  },
);

MaskedInput.displayName = 'MaskedInput';
