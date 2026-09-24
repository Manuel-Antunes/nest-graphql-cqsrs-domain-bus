'use client';

import * as React from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import { DatePicker } from '@nestposts/ui/components/ui/date-picker';
import { DateRangePicker } from '@nestposts/ui/components/ui/date-range-picker';
import { Input } from '@nestposts/ui/components/ui/input';
import { Label } from '@nestposts/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import type { Column } from '@tanstack/react-table';
import { ChevronDown, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { AsyncSelect } from '../async-select';

interface FilterChipProps {
  column: Column<any, unknown>;
  onRemove: () => void;
  label?: string;
  variant?: 'default' | 'static';
}

export function FilterChip({
  column,
  onRemove,
  label,
  variant = 'default',
}: FilterChipProps) {
  const [open, setOpen] = React.useState(false);
  const columnFilterValue = column.getFilterValue();
  const intialTempValue = React.useMemo(() => {
    if (columnFilterValue === undefined) return undefined;
    if (typeof columnFilterValue === 'string')
      return columnFilterValue.replace(/%/g, '');
    return columnFilterValue;
  }, [columnFilterValue]);

  const [tempValue, setTempValue] = React.useState(intialTempValue);
  const [operator, setOperator] = React.useState('includes');
  const [selectedAsyncOption, setSelectedAsyncOption] =
    React.useState<any>(null);
  const [isLoadingAsyncOption, setIsLoadingAsyncOption] = React.useState(false);

  const { filterVariant } = column.columnDef.meta ?? {};

  React.useEffect(() => {
    const fetchSelectedOption = async () => {
      if (
        filterVariant === 'async-select' &&
        columnFilterValue &&
        typeof columnFilterValue === 'string' &&
        column.columnDef.meta?.filterOptions?.fetcher
      ) {
        setIsLoadingAsyncOption(true);
        try {
          const options = await column.columnDef.meta.filterOptions.fetcher('');
          const matchedOption = options.find(
            (opt: any) =>
              column.columnDef.meta?.filterOptions?.getOptionValue?.(opt) ===
              columnFilterValue,
          );
          if (matchedOption) {
            setSelectedAsyncOption(matchedOption);
          }
        } catch (error) {
          console.error('Error fetching async option:', error);
        } finally {
          setIsLoadingAsyncOption(false);
        }
      }
    };

    fetchSelectedOption();
  }, [columnFilterValue, filterVariant, column.columnDef.meta?.filterOptions]);

  React.useEffect(() => {
    if (columnFilterValue === undefined) {
      setTempValue(undefined);
      setSelectedAsyncOption(null);
    } else if (typeof columnFilterValue === 'string') {
      setTempValue(columnFilterValue.replace(/%/g, ''));
    } else {
      setTempValue(columnFilterValue);
    }
  }, [columnFilterValue]);

  const columnHeader =
    label ||
    (typeof column.columnDef.header === 'string'
      ? column.columnDef.header
      : column.id);
  const currentValue = column.getFilterValue();

  const getDisplayValue = () => {
    if (!currentValue) return 'Tudo';

    if (
      filterVariant === 'dateRange' &&
      'from' in (currentValue as DateRange) &&
      'to' in (currentValue as DateRange)
    ) {
      const { from: start, to: end } = currentValue as DateRange;
      return `${start?.toLocaleDateString('pt-BR')} - ${end?.toLocaleDateString('pt-BR')}`;
    }

    if (filterVariant === 'date') {
      return new Date(currentValue.toString()).toLocaleDateString('pt-BR');
    }

    if (filterVariant === 'text') {
      return `${operator} "${currentValue.toString().replace(/%/g, '')}"`;
    }

    if (
      filterVariant === 'select' &&
      column.columnDef.meta?.filterOptions?.getDisplayValue
    ) {
      return column.columnDef.meta.filterOptions.getDisplayValue(currentValue);
    }

    if (
      filterVariant === 'async-select' &&
      column.columnDef.meta?.filterOptions?.getDisplayValue
    ) {
      if (selectedAsyncOption) {
        return column.columnDef.meta.filterOptions.getDisplayValue(
          selectedAsyncOption,
        );
      }
      if (isLoadingAsyncOption) {
        return 'Carregando...';
      }
      return currentValue.toString();
    }

    return currentValue.toString();
  };

  const applyFilter = () => {
    let value = tempValue;
    if (filterVariant === 'text') {
      const parsersMap = {
        'includes': (val: string) => `%${val}%`,
        'starts-with': (val: string) => `${val}%`,
        'ends-with': (val: string) => `%${val}`,
        'equals': (val: string) => val,
      };
      value = (tempValue as string)
        ? parsersMap[operator as keyof typeof parsersMap](tempValue as string)
        : undefined;
    }
    column.setFilterValue(value);
    setOpen(false);
  };

  const deleteFilter = () => {
    column.setFilterValue(null);
    setTempValue(undefined);
    setOpen(false);
    onRemove();
  };

  const sortedUniqueValues = React.useMemo(() => {
    if (
      filterVariant === 'range' ||
      filterVariant === 'date' ||
      filterVariant === 'dateRange'
    )
      return [];

    if (column.columnDef.meta?.filterOptions?.options) {
      return column.columnDef.meta.filterOptions.options;
    }

    const values = Array.from(column.getFacetedUniqueValues().keys());
    return Array.from(new Set(values)).sort();
  }, [
    column.getFacetedUniqueValues(),
    filterVariant,
    column.columnDef.meta?.filterOptions?.options,
  ]);

  if (variant === 'static') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-gray-200 border-dashed bg-transparent"
      >
        {columnHeader}:{' ' + getDisplayValue()}
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {columnHeader}:{' ' + getDisplayValue()}
        <ChevronDown className="ml-1 h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-sm">{columnHeader}</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteFilter}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {filterVariant === 'select' && (
            <div className="space-y-2">
              <Select
                value={tempValue?.toString() || 'all'}
                onValueChange={(value) =>
                  setTempValue(value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tudo</SelectItem>
                  {sortedUniqueValues.map((value) => (
                    <SelectItem key={String(value)} value={String(value)}>
                      {column.columnDef.meta?.filterOptions?.getDisplayValue
                        ? column.columnDef.meta.filterOptions.getDisplayValue(
                            value,
                          )
                        : String(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterVariant === 'text' && (
            <div className="space-y-2">
              <Select
                value={operator}
                onValueChange={(value) => setOperator(value ?? '')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="includes">Inclui</SelectItem>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="starts-with">Começa com</SelectItem>
                  <SelectItem value="ends-with">Termina com</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={`Insira ${columnHeader.toLowerCase()}`}
                value={(tempValue as string) || ''}
                onChange={(e) => setTempValue(e.target.value)}
              />
            </div>
          )}

          {filterVariant === 'date' && (
            <div className="space-y-2">
              <DatePicker
                value={tempValue ? new Date(tempValue.toString()) : undefined}
                onChange={(date) =>
                  setTempValue(date ? date.toISOString() : undefined)
                }
                placeholder={`Select ${columnHeader.toLowerCase()}`}
              />
            </div>
          )}

          {filterVariant === 'dateRange' && (
            <div className="space-y-2">
              <DateRangePicker
                value={tempValue as DateRange}
                onChange={(range) => {
                  setTempValue(range);
                }}
                placeholder="Select Range"
              />
            </div>
          )}

          {filterVariant === 'async-select' && (
            <div className="space-y-2">
              <AsyncSelect<any>
                fetcher={
                  column.columnDef.meta?.filterOptions?.fetcher ||
                  (() => Promise.resolve([]))
                }
                getDisplayValue={
                  column.columnDef.meta?.filterOptions?.getDisplayValue ||
                  ((item) => item.toString())
                }
                getOptionValue={
                  column.columnDef.meta?.filterOptions?.getOptionValue ||
                  ((item) => item.toString())
                }
                renderOption={
                  column.columnDef.meta?.filterOptions?.renderOption ||
                  ((item) => <div>{item.name}</div>)
                }
                onChange={(value) => {
                  setTempValue(value);
                }}
                label={columnHeader}
                value={tempValue as string}
                placeholder={
                  column.columnDef.meta?.filterOptions?.placeholder || undefined
                }
                triggerClassName="!w-full overflow-x-hidden"
              />
            </div>
          )}

          {filterVariant === 'range' && (
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Input
                  placeholder="Mín"
                  type="number"
                  value={(tempValue as [number, number])?.[0] ?? ''}
                  onChange={(e) =>
                    setTempValue((old: [number, number]) => [
                      e.target.value ? Number(e.target.value) : undefined,
                      old?.[1],
                    ])
                  }
                />
                <Input
                  placeholder="Máx"
                  type="number"
                  value={(tempValue as [number, number])?.[1] ?? ''}
                  onChange={(e) =>
                    setTempValue((old: [number, number]) => [
                      old?.[0],
                      e.target.value ? Number(e.target.value) : undefined,
                    ])
                  }
                />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={deleteFilter}>
              Deletar Filtro
            </Button>
            <Button size="sm" onClick={applyFilter}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
