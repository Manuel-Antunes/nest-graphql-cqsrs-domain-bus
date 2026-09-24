'use client';

import * as React from 'react';
import { cn } from '@nestposts/ui/lib/utils';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from './button';
import { Input } from './input';

interface PasswordInputProps extends React.ComponentProps<'input'> {
  ref?: React.Ref<HTMLInputElement>;
}

const PasswordInput = ({ ref, className, ...props }: PasswordInputProps) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={showPassword ? 'text' : 'password'}
        className={cn('hide-password-toggle pr-10', className)}
        ref={ref}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute top-0 right-0 h-full cursor-pointer px-3 py-2 hover:bg-transparent"
        onClick={() => setShowPassword((prev) => !prev)}
      >
        {showPassword ? (
          <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-4" aria-hidden="true" />
        )}
        <span className="sr-only">
          {showPassword ? 'Hide password' : 'Show password'}
        </span>
      </Button>

      <style>{`
                .hide-password-toggle::-ms-reveal,
                .hide-password-toggle::-ms-clear {
                    visibility: hidden;
                    pointer-events: none;
                    display: none;
                }
            `}</style>
    </div>
  );
};
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
