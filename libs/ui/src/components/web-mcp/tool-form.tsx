'use client';

import * as React from 'react';
import * as Slot from '@radix-ui/react-slot';

import type { WebMcpToolResult } from './types';

const useEffectEvent =
  (React as unknown as { useEffectEvent?: typeof React.useEffect })
    .useEffectEvent ||
  (React as unknown as { experimental_useEffectEvent?: typeof React.useEffect })
    .experimental_useEffectEvent;

const useSafeLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export interface ToolFormContextValue {
  toolName: string;
  isAgentActive: boolean;
  isAgentInvoked: boolean;
  resolve: (result: WebMcpToolResult) => void;
}

const ToolFormContext = React.createContext<ToolFormContextValue | null>(null);

export function useToolForm(): ToolFormContextValue {
  const ctx = React.useContext(ToolFormContext);
  if (!ctx) {
    throw new Error('useToolForm must be used within a <ToolForm>');
  }
  return ctx;
}

export interface ToolFormProps
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  name: string;
  description: string;
  autoSubmit?: boolean;
  onSubmit?: (
    event: React.FormEvent<HTMLFormElement>,
    ctx: {
      agentInvoked: boolean;
      resolve: (result: WebMcpToolResult) => void;
    },
  ) => void | WebMcpToolResult | Promise<WebMcpToolResult | void>;
  onToolActivated?: () => void;
  onToolCancel?: () => void;
  asChild?: boolean;
  children?: React.ReactNode;
}

export const ToolForm = React.forwardRef<HTMLFormElement, ToolFormProps>(
  (
    {
      name,
      description,
      autoSubmit = false,
      onSubmit,
      onToolActivated,
      onToolCancel,
      asChild = false,
      children,
      ...rest
    },
    ref,
  ) => {
    const [isAgentActive, setIsAgentActive] = React.useState(false);
    const [isAgentInvoked, setIsAgentInvoked] = React.useState(false);
    const resolverRef = React.useRef<
      ((value: WebMcpToolResult) => void) | null
    >(null);

    const onToolActivatedEvent = useEffectEvent
      ? (useEffectEvent as (cb: () => void) => () => void)(() =>
          onToolActivated?.(),
        )
      : () => onToolActivated?.();
    const onToolCancelEvent = useEffectEvent
      ? (useEffectEvent as (cb: () => void) => () => void)(() => {
          setIsAgentActive(false);
          setIsAgentInvoked(false);
          resolverRef.current = null;
          onToolCancel?.();
        })
      : () => {
          setIsAgentActive(false);
          setIsAgentInvoked(false);
          resolverRef.current = null;
          onToolCancel?.();
        };

    const onSubmitEvent = useEffectEvent
      ? (
          useEffectEvent as (
            cb: typeof handleSubmitInner,
          ) => typeof handleSubmitInner
        )(handleSubmitInner)
      : handleSubmitInner;

    function handleSubmitInner(
      e: React.FormEvent<HTMLFormElement>,
      ctx: {
        agentInvoked: boolean;
        resolve: (result: WebMcpToolResult) => void;
      },
    ) {
      return onSubmit?.(e, ctx);
    }

    const resolve = React.useCallback((result: WebMcpToolResult) => {
      resolverRef.current?.(result);
      resolverRef.current = null;
      setIsAgentActive(false);
    }, []);

    useSafeLayoutEffect(() => {
      const handleActivated = (e: ToolActivatedEvent) => {
        if (e.toolName !== name) return;
        setIsAgentActive(true);
        onToolActivatedEvent();
      };
      const handleCancel = (e: ToolActivatedEvent) => {
        if (e.toolName !== name) return;
        onToolCancelEvent();
      };
      window.addEventListener('toolactivated', handleActivated);
      window.addEventListener('toolcancel', handleCancel);
      return () => {
        window.removeEventListener('toolactivated', handleActivated);
        window.removeEventListener('toolcancel', handleCancel);
      };
    }, [name, onToolActivatedEvent, onToolCancelEvent]);

    const handleSubmit = React.useCallback(
      (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const nativeEvent = e.nativeEvent as SubmitEvent;
        const agentInvoked = nativeEvent?.agentInvoked === true;
        setIsAgentInvoked(agentInvoked);

        if (agentInvoked && typeof nativeEvent.respondWith === 'function') {
          nativeEvent.respondWith(
            new Promise<WebMcpToolResult>((res) => {
              resolverRef.current = res;
            }),
          );
        }

        const maybeResult = onSubmitEvent(e, { agentInvoked, resolve });
        if (maybeResult != null) {
          Promise.resolve(maybeResult).then((r) => {
            if (r) resolve(r);
          });
        } else if (!agentInvoked) {
          setIsAgentActive(false);
        }
      },
      [onSubmitEvent, resolve],
    );

    const contextValue = React.useMemo<ToolFormContextValue>(
      () => ({ toolName: name, isAgentActive, isAgentInvoked, resolve }),
      [name, isAgentActive, isAgentInvoked, resolve],
    );

    const toolAttrs: Record<string, unknown> = {
      toolname: name,
      tooldescription: description,
      ...(autoSubmit ? { toolautosubmit: '' } : {}),
    };

    const Comp = asChild ? Slot.Slot : 'form';

    return (
      <ToolFormContext.Provider value={contextValue}>
        <Comp
          ref={ref as never}
          onSubmit={handleSubmit as never}
          {...toolAttrs}
          {...rest}
        >
          {children}
        </Comp>
      </ToolFormContext.Provider>
    );
  },
);
ToolForm.displayName = 'ToolForm';

export interface ToolParamProps
  extends React.ComponentPropsWithoutRef<typeof Slot.Slot> {
  description?: string;
}

export const ToolParam = React.forwardRef<
  React.ComponentRef<typeof Slot.Slot>,
  ToolParamProps
>(({ description, ...props }, ref) => {
  const extra: Record<string, string | undefined> = {};
  if (description != null) extra.toolparamdescription = description;
  return <Slot.Slot ref={ref} {...extra} {...props} />;
});
ToolParam.displayName = 'ToolParam';

export interface ToolSubmitProps {
  children: React.ReactElement;
}

export function ToolSubmit({ children }: ToolSubmitProps) {
  return children;
}
ToolSubmit.displayName = 'ToolSubmit';
