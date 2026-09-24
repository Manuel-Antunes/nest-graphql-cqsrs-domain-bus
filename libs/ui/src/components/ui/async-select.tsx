import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@nestposts/ui/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import { Separator } from '@nestposts/ui/components/ui/separator';
import { useDebounce } from '@nestposts/ui/hooks/use-debounce';
import { cn } from '@nestposts/ui/lib/utils';
import {
  Check,
  CheckIcon,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  X,
} from 'lucide-react';

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  icon?: React.ReactNode;
}

export interface AsyncSelectBaseSingleProps<T> {
  multi?: false;
  value: string;
  onChange: (value: string) => void;
}

export interface AsyncSelectBaseMultiProps<T> {
  multi: true;
  value: string[];
  onChange: (value: string[]) => void;
  maxCount?: number;
  clearText?: string;
  closeText?: string;
  hideSelectAll?: boolean;
  clearSearchOnClose?: boolean;
}

export interface AsyncSelectCommonProps<T> {
  fetcher: (query?: string) => Promise<T[]>;
  preload?: boolean;
  filterFn?: (option: T, query: string) => boolean;
  renderOption: (option: T) => React.ReactNode;
  getOptionValue: (option: T) => string;
  getDisplayValue: (option: T) => React.ReactNode;
  notFound?: React.ReactNode;
  loadingSkeleton?: React.ReactNode;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  width?: string | number;
  popoverAlign?: 'start' | 'center' | 'end';
  className?: string;
  triggerClassName?: string;
  selectAllText?: string;
  noResultsMessage?: string;
  clearable?: boolean;
}

export type AsyncSelectProps<T> = AsyncSelectCommonProps<T> &
  (AsyncSelectBaseSingleProps<T> | AsyncSelectBaseMultiProps<T>);

export function AsyncSelect<T>(props: AsyncSelectProps<T>) {
  const {
    fetcher,
    preload,
    filterFn,
    renderOption,
    getOptionValue,
    getDisplayValue,
    notFound,
    loadingSkeleton,
    label,
    placeholder = 'Select...',
    value,
    onChange,
    disabled = false,
    width = '200px',
    popoverAlign = 'center',
    className,
    triggerClassName,
    noResultsMessage,
    clearable = true,
    selectAllText = 'Select all',
  } = props;

  const multi = 'multi' in props && props.multi;
  const maxCount = multi && 'maxCount' in props ? props.maxCount || 3 : 3;
  const clearText =
    multi && 'clearText' in props ? props.clearText || 'Clear' : 'Clear';
  const closeText =
    multi && 'closeText' in props ? props.closeText || 'Close' : 'Close';
  const hideSelectAll =
    multi && 'hideSelectAll' in props ? props.hideSelectAll || false : false;
  const clearSearchOnClose =
    multi && 'clearSearchOnClose' in props
      ? props.clearSearchOnClose || false
      : false;

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, preload ? 0 : 300);
  const [originalOptions, setOriginalOptions] = useState<T[]>([]);

  const [selectedValue, setSelectedValue] = useState(
    multi ? [] : (value as string),
  );
  const [selectedOption, setSelectedOption] = useState<T | null>(null);

  const [selectedValues, setSelectedValues] = useState<string[]>(
    multi ? (value as string[]) || [] : [],
  );
  const [selectedOptions, setSelectedOptions] = useState<T[]>([]);

  useEffect(() => {
    setMounted(true);
    if (multi) {
      setSelectedValues((value as string[]) || []);
    } else {
      setSelectedValue(value as string);
    }
  }, [value, multi]);

  useEffect(() => {
    if (options.length > 0) {
      if (multi) {
        const multiValue = value as string[];
        if (multiValue && multiValue.length > 0) {
          const matchedOptions = multiValue
            .map((val) => options.find((opt) => getOptionValue(opt) === val))
            .filter(Boolean) as T[];
          setSelectedOptions(matchedOptions);
        }
      } else {
        const singleValue = value as string;
        if (singleValue) {
          const option = options.find(
            (opt) => getOptionValue(opt) === singleValue,
          );
          if (option) {
            setSelectedOption(option);
          }
        }
      }
    }
  }, [value, options, getOptionValue, multi]);

  useEffect(() => {
    const initializeOptions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetcher();
        setOriginalOptions(data);
        setOptions(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch options',
        );
      } finally {
        setLoading(false);
      }
    };

    if (!mounted) {
      initializeOptions();
    }
  }, [mounted, fetcher]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetcher(debouncedSearchTerm);
        setOriginalOptions(data);
        setOptions(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch options',
        );
      } finally {
        setLoading(false);
      }
    };

    if (!mounted) {
      fetchOptions();
    } else if (!preload) {
      fetchOptions();
    } else if (preload) {
      if (debouncedSearchTerm) {
        setOptions(
          originalOptions.filter((option) =>
            filterFn ? filterFn(option, debouncedSearchTerm) : true,
          ),
        );
      } else {
        setOptions(originalOptions);
      }
    }
  }, [fetcher, debouncedSearchTerm, mounted, preload, filterFn]);

  const handleSelect = useCallback(
    (currentValue: string) => {
      if (multi) {
        const multiOnChange = onChange as (value: string[]) => void;
        const currentValues = selectedValues;
        const isSelected = currentValues.includes(currentValue);
        const newValues = isSelected
          ? currentValues.filter((val) => val !== currentValue)
          : [...currentValues, currentValue];

        setSelectedValues(newValues);
        setSelectedOptions(
          newValues
            .map((val) =>
              options.find((option) => getOptionValue(option) === val),
            )
            .filter(Boolean) as T[],
        );
        multiOnChange(newValues);
      } else {
        const singleOnChange = onChange as (value: string) => void;
        const newValue =
          clearable && currentValue === selectedValue ? '' : currentValue;
        setSelectedValue(newValue);
        setSelectedOption(
          options.find((option) => getOptionValue(option) === newValue) || null,
        );
        singleOnChange(newValue);
        setOpen(false);
      }
    },
    [
      selectedValue,
      selectedValues,
      onChange,
      clearable,
      options,
      getOptionValue,
      multi,
    ],
  );

  const handleClear = useCallback(() => {
    if (multi) {
      const multiOnChange = onChange as (value: string[]) => void;
      setSelectedValues([]);
      setSelectedOptions([]);
      multiOnChange([]);
    } else {
      const singleOnChange = onChange as (value: string) => void;
      setSelectedValue('');
      setSelectedOption(null);
      singleOnChange('');
    }
  }, [onChange, multi]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      setOpen(true);
    } else if (
      event.key === 'Backspace' &&
      !event.currentTarget.value &&
      multi
    ) {
      const newSelectedValues = [...selectedValues];
      newSelectedValues.pop();
      setSelectedValues(newSelectedValues);
      setSelectedOptions(
        newSelectedValues
          .map((val) =>
            options.find((option) => getOptionValue(option) === val),
          )
          .filter(Boolean) as T[],
      );
      (onChange as (value: string[]) => void)(newSelectedValues);
    }
  };

  const toggleAll = useCallback(() => {
    if (!multi) return;
    const multiOnChange = onChange as (value: string[]) => void;

    if (selectedValues.length === options.length) {
      setSelectedValues([]);
      setSelectedOptions([]);
      multiOnChange([]);
    } else {
      const allValues = options.map((option) => getOptionValue(option));
      setSelectedValues(allValues);
      setSelectedOptions(options);
      multiOnChange(allValues);
    }
  }, [selectedValues, options, onChange, getOptionValue, multi]);

  const clearExtraOptions = useCallback(() => {
    if (!multi) return;
    const multiOnChange = onChange as (value: string[]) => void;
    const newSelectedValues = selectedValues.slice(0, maxCount);
    setSelectedValues(newSelectedValues);
    setSelectedOptions(
      newSelectedValues
        .map((val) => options.find((option) => getOptionValue(option) === val))
        .filter(Boolean) as T[],
    );
    multiOnChange(newSelectedValues);
  }, [selectedValues, maxCount, options, onChange, getOptionValue, multi]);

  const removeValue = useCallback(
    (valueToRemove: string) => {
      if (!multi) return;
      const multiOnChange = onChange as (value: string[]) => void;
      const newValues = selectedValues.filter((val) => val !== valueToRemove);
      setSelectedValues(newValues);
      setSelectedOptions(
        newValues
          .map((val) =>
            options.find((option) => getOptionValue(option) === val),
          )
          .filter(Boolean) as T[],
      );
      multiOnChange(newValues);
    },
    [selectedValues, options, onChange, getOptionValue, multi],
  );

  const renderSingleTrigger = () => (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn(
        'justify-between',
        disabled && 'cursor-not-allowed opacity-50',
        triggerClassName,
      )}
      {...(typeof width === 'string'
        ? { style: { width } }
        : { className: `w-[${width}px]` })}
      disabled={disabled}
    >
      {selectedOption ? getDisplayValue(selectedOption) : placeholder}
      <ChevronsUpDown className="opacity-50" size={10} />
    </Button>
  );

  const renderMultiTrigger = () => (
    <div
      className={cn(
        'flex h-auto min-h-[36px] w-full min-w-[160px] cursor-pointer items-center justify-between rounded-md border border-input bg-background px-2 py-0.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        disabled && 'cursor-not-allowed opacity-50',
        triggerClassName,
      )}
      {...(typeof width === 'string'
        ? { style: { width } }
        : { className: `w-[${width}px]` })}
    >
      {selectedValues.length > 0 ? (
        <div className="flex w-full items-center justify-between">
          <div className="flex max-h-20 min-w-0 flex-1 flex-wrap items-center gap-1 overflow-y-auto pr-2">
            {selectedValues.slice(0, maxCount).map((val) => {
              const option = selectedOptions.find(
                (opt) => getOptionValue(opt) === val,
              );
              return (
                <div
                  className="flex h-[26px] flex-shrink-0 items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:border-zinc-400 hover:text-primary dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-primary"
                  key={val}
                >
                  <div className="flex max-w-[100px] items-center gap-1 truncate text-xs">
                    {option ? getDisplayValue(option) : val}
                  </div>
                  <X
                    className="box-content h-3 w-3 shrink-0 cursor-pointer rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeValue(val);
                    }}
                  />
                </div>
              );
            })}
            {selectedValues.length > maxCount && (
              <Badge variant="outline" className="flex-shrink-0">
                <span>{`+ ${selectedValues.length - maxCount}`}</span>
                <X
                  className="ml-2 box-content h-3 w-3 shrink-0 cursor-pointer rounded-full p-1 text-zinc-300 hover:bg-zinc-100 hover:text-primary dark:text-zinc-500 dark:hover:bg-zinc-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    clearExtraOptions();
                  }}
                />
              </Badge>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center justify-between">
            <X
              className="ml-2 box-content h-4 w-4 shrink-0 cursor-pointer rounded-full p-1 text-zinc-300 hover:bg-zinc-100 hover:text-primary dark:text-zinc-500 dark:hover:bg-zinc-800"
              onClick={(event) => {
                event.stopPropagation();
                handleClear();
              }}
            />
            <Separator
              orientation="vertical"
              className="mx-2 flex h-full min-h-6"
            />
            <ChevronDown className="h-4 cursor-pointer text-zinc-300 hover:text-primary dark:text-zinc-500" />
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full items-center justify-between">
          <span className="font-normal text-[12px] text-zinc-500">
            {placeholder}
          </span>
          <ChevronDown className="h-4 cursor-pointer text-zinc-300 dark:text-zinc-500" />
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen && clearSearchOnClose && multi) {
          setSearchTerm('');
        }
      }}
    >
      <PopoverTrigger
        render={multi ? renderMultiTrigger() : renderSingleTrigger()}
      />
      <PopoverContent
        align={popoverAlign}
        {...(typeof width === 'string'
          ? { style: { width } }
          : { className: `w-[${width}px]` })}
        className={cn('p-0', className)}
      >
        <Command shouldFilter={false}>
          <div className="relative w-full border-b">
            <CommandInput
              placeholder={`Buscar ${label.toLowerCase()}...`}
              value={searchTerm}
              onValueChange={(value) => {
                setSearchTerm(value);
              }}
              onKeyDown={handleInputKeyDown}
            />
            {loading && options.length > 0 && (
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 transform items-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            {error && (
              <div className="p-4 text-center text-destructive">{error}</div>
            )}
            {loading &&
              options.length === 0 &&
              (loadingSkeleton || <DefaultLoadingSkeleton />)}
            {!loading &&
              !error &&
              options.length === 0 &&
              (notFound || (
                <CommandEmpty>
                  {noResultsMessage ?? `No ${label.toLowerCase()} found.`}
                </CommandEmpty>
              ))}
            <CommandGroup>
              {multi && !hideSelectAll && (
                <CommandItem
                  key="all"
                  onSelect={toggleAll}
                  className="cursor-pointer"
                >
                  <div
                    className={cn(
                      'mr-1 flex size-4 items-center justify-center rounded-[4px] border border-primary shadow-xs outline-none transition-shadow',
                      selectedValues.length === options.length
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <CheckIcon className="size-3.5 text-white dark:text-black" />
                  </div>
                  <span>{selectAllText}</span>
                </CommandItem>
              )}
              {options.map((option) => {
                const optionValue = getOptionValue(option);
                const isSelected = multi
                  ? selectedValues.includes(optionValue)
                  : selectedValue === optionValue;

                return (
                  <CommandItem
                    key={optionValue}
                    value={optionValue}
                    onSelect={handleSelect}
                    className="cursor-pointer"
                  >
                    {multi && (
                      <div
                        className={cn(
                          'mr-1 flex size-4 items-center justify-center rounded-[4px] border border-primary shadow-xs outline-none transition-shadow',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible',
                        )}
                      >
                        <CheckIcon className="size-3.5 text-white dark:text-black" />
                      </div>
                    )}
                    {renderOption(option)}
                    {!multi && (
                      <Check
                        className={cn(
                          'ml-auto h-3 w-3',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {multi && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <div className="flex items-center justify-between">
                    {selectedValues.length > 0 && (
                      <>
                        <CommandItem
                          onSelect={handleClear}
                          className="flex-1 cursor-pointer justify-center"
                        >
                          {clearText}
                        </CommandItem>
                        <Separator
                          orientation="vertical"
                          className="flex h-full min-h-6"
                        />
                      </>
                    )}
                    <CommandItem
                      onSelect={() => setOpen(false)}
                      className="max-w-full flex-1 cursor-pointer justify-center"
                    >
                      {closeText}
                    </CommandItem>
                  </div>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DefaultLoadingSkeleton() {
  return (
    <CommandGroup>
      {[1, 2, 3].map((i) => (
        <CommandItem key={i} disabled>
          <div className="flex w-full items-center gap-2">
            <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
