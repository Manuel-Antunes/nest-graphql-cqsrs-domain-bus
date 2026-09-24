'use client';

import * as React from 'react';
import { cn } from '@nestposts/ui/lib/utils';
import type { GroupBase, StylesConfig } from 'react-select';
import type { CreatableProps } from 'react-select/creatable';
import CreatableSelect from 'react-select/creatable';

export interface CreatableAutocompleteOption {
  readonly label: string;
  readonly value: string;
}

export interface CreatableAutocompleteProps<IsMulti extends boolean = false>
  extends Omit<
    CreatableProps<
      CreatableAutocompleteOption,
      IsMulti,
      GroupBase<CreatableAutocompleteOption>
    >,
    'styles' | 'classNames'
  > {
  className?: string;
}

function CreatableAutocompleteInner<IsMulti extends boolean = false>(
  { className, ...props }: CreatableAutocompleteProps<IsMulti>,
  ref: React.Ref<unknown>,
) {
  const customStyles: StylesConfig<
    CreatableAutocompleteOption,
    boolean,
    GroupBase<CreatableAutocompleteOption>
  > = {
    control: (base, state) => ({
      ...base,
      'minHeight': '36px',
      'borderRadius': 'calc(var(--radius) - 2px)',
      'borderColor': state.isFocused ? 'hsl(var(--ring))' : 'hsl(var(--input))',
      'backgroundColor': 'hsl(var(--background))',
      'boxShadow': state.isFocused
        ? '0 0 0 1px hsl(var(--ring))'
        : 'var(--tw-shadow, 0 1px 2px 0 rgb(0 0 0 / 0.05))',
      '&:hover': {
        borderColor: state.isFocused ? 'hsl(var(--ring))' : 'hsl(var(--input))',
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '2px 12px',
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: 'hsl(var(--foreground))',
    }),
    placeholder: (base) => ({
      ...base,
      color: 'hsl(var(--muted-foreground))',
      fontSize: '0.875rem',
    }),
    singleValue: (base) => ({
      ...base,
      color: 'hsl(var(--foreground))',
      fontSize: '0.875rem',
    }),
    multiValue: (base) => ({
      ...base,
      borderRadius: 'calc(var(--radius) - 4px)',
      backgroundColor: 'hsl(var(--secondary))',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: 'hsl(var(--secondary-foreground))',
      fontSize: '0.875rem',
    }),
    multiValueRemove: (base) => ({
      ...base,
      'color': 'hsl(var(--secondary-foreground))',
      '&:hover': {
        backgroundColor: 'hsl(var(--destructive))',
        color: 'hsl(var(--destructive-foreground))',
      },
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 'calc(var(--radius) - 2px)',
      backgroundColor: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      boxShadow:
        '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      zIndex: 50,
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    menuList: (base) => ({
      ...base,
      padding: '4px',
    }),
    option: (base, state) => ({
      ...base,
      'borderRadius': 'calc(var(--radius) - 4px)',
      'fontSize': '0.875rem',
      'cursor': 'pointer',
      'backgroundColor': state.isSelected
        ? 'hsl(var(--accent))'
        : state.isFocused
          ? 'hsl(var(--accent))'
          : 'transparent',
      'color': state.isSelected
        ? 'hsl(var(--accent-foreground))'
        : state.isFocused
          ? 'hsl(var(--accent-foreground))'
          : 'hsl(var(--popover-foreground))',
      '&:active': {
        backgroundColor: 'hsl(var(--accent))',
      },
    }),
    indicatorSeparator: () => ({
      display: 'none',
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      'padding': '0 8px',
      'color': 'hsl(var(--muted-foreground))',
      'transition': 'transform 0.2s',
      'transform': state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined,
      '&:hover': {
        color: 'hsl(var(--foreground))',
      },
    }),
    clearIndicator: (base) => ({
      ...base,
      'padding': '0 8px',
      'color': 'hsl(var(--muted-foreground))',
      '&:hover': {
        color: 'hsl(var(--destructive))',
      },
    }),
    loadingIndicator: (base) => ({
      ...base,
      color: 'hsl(var(--muted-foreground))',
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: 'hsl(var(--muted-foreground))',
      fontSize: '0.875rem',
    }),
  };

  return (
    <CreatableSelect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as React.Ref<any>}
      styles={customStyles}
      className={cn('react-select-container', className)}
      classNamePrefix="react-select"
      menuPortalTarget={
        typeof document !== 'undefined' ? document.body : undefined
      }
      {...props}
    />
  );
}

const ForwardedCreatableAutocomplete = React.forwardRef(
  CreatableAutocompleteInner,
);
ForwardedCreatableAutocomplete.displayName = 'CreatableAutocomplete';

export const CreatableAutocomplete = ForwardedCreatableAutocomplete as <
  IsMulti extends boolean = false,
>(
  props: CreatableAutocompleteProps<IsMulti> & {
    ref?: React.Ref<unknown>;
  },
) => React.ReactElement;
