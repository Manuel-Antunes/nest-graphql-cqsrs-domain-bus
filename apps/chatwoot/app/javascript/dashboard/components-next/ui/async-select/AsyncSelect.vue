<script setup lang="ts" generic="T">
import type { Ref } from 'vue';
import { computed, onMounted, ref, watch } from 'vue';
import { onClickOutside, refDebounced } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { Check, ChevronDown, ChevronsUpDown, Search, X } from '@lucide/vue';
import { Button } from 'next/ui/button';
import { Badge } from 'next/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'next/ui/command';

import { Popover, PopoverContent, PopoverTrigger } from 'next/ui/popover';
import { Spinner } from 'next/ui/spinner';
import { cn } from 'next/lib/utils';

defineOptions({ inheritAttrs: false });

const SELECT_ALL_VALUE = '__async_select_all__';

const props = withDefaults(
  defineProps<{
    /** Selected value (string in single mode, string[] in multi mode). */
    modelValue: string | string[];
    /** Static options. Used when no `fetcher` is provided (client-filtered). */
    options?: T[];
    /** Async function that returns the options for a given query. */
    fetcher?: (query?: string) => Promise<T[]>;
    /** Returns the stable value of an option (defaults to `option.value`). */
    getOptionValue?: (option: T) => string;
    /** Returns the display label of an option (defaults to `option.label`). */
    getOptionLabel?: (option: T) => string;
    /** Enable multi-select. */
    multi?: boolean;
    /** When using a fetcher, fetch once and filter locally instead of re-fetching. */
    preload?: boolean;
    /** The consumer owns filtering (drives `options` server-side via `@search`).
     * Skip the built-in client-side label filter so freshly-fetched results
     * aren't re-filtered out (they'd flicker in then vanish). */
    useApiResults?: boolean;
    /** Field label, used to build the default search placeholder. */
    label?: string;
    placeholder?: string;
    /** Overrides the auto-generated search placeholder. */
    searchPlaceholder?: string;
    disabled?: boolean;
    /** Allow toggling off the current value in single mode. */
    clearable?: boolean;
    /** Max badges shown before collapsing to "+N" (multi mode). */
    maxCount?: number;
    hideSelectAll?: boolean;
    width?: string;
    popoverAlign?: 'start' | 'center' | 'end';
    /** Empty-state text (alias kept for ComboBox parity). */
    emptyState?: string;
    notFoundText?: string;
    /** Helper / error text shown below the control. */
    message?: string;
    hasError?: boolean;
    selectAllText?: string;
    clearText?: string;
    closeText?: string;
    triggerClass?: string;
    /** Render the dropdown inline instead of portaling it to <body>. Needed
     * when the select lives inside a panel that closes on outside-click. */
    disablePortal?: boolean;
  }>(),
  {
    options: () => [],
    fetcher: undefined,
    getOptionValue: (option: any) => String(option?.value ?? ''),
    getOptionLabel: (option: any) => String(option?.label ?? ''),
    multi: false,
    preload: false,
    useApiResults: false,
    label: '',
    placeholder: 'Select...',
    searchPlaceholder: '',
    disabled: false,
    clearable: true,
    maxCount: 3,
    hideSelectAll: false,
    width: '',
    popoverAlign: 'start',
    emptyState: '',
    notFoundText: '',
    message: '',
    hasError: false,
    // Empty by default so the i18n fallbacks below apply; pass a prop to override.
    selectAllText: '',
    clearText: '',
    closeText: '',
    triggerClass: '',
    disablePortal: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]];
  search: [query: string];
}>();

const { t } = useI18n();

// Footer/select-all labels: use the prop when provided, otherwise fall back to
// the shared translations so every AsyncSelect is localized without each call
// site repeating them.
const selectAllLabel = computed(
  () => props.selectAllText || t('FORMS.MULTISELECT.SELECT_ALL')
);
const clearLabel = computed(() => props.clearText || t('FORMS.MULTISELECT.CLEAR'));
const closeLabel = computed(() => props.closeText || t('FORMS.MULTISELECT.CLOSE'));

const loading = ref(false);
const error = ref<string | null>(null);
const searchTerm = ref('');
const debouncedSearch = refDebounced(searchTerm, 300);
const internalOptions = ref([]) as Ref<T[]>;
const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

// reka's own outside-click dismissal doesn't fire reliably for this
// Popover+Command combo (the dropdown gets stuck open, blocking the page), so
// we close it ourselves. `ignore` keeps clicks inside the dropdown from closing
// it — matched by `data-slot` so it works whether the content is portaled to
// <body> or rendered inline (disablePortal).
onClickOutside(
  containerRef,
  () => {
    if (open.value) open.value = false;
  },
  { ignore: ['[data-slot="popover-content"]'] }
);

function selectSingle(value: string) {
  if (!props.clearable && value === selectedValue.value) {
    return;
  }

  emit('update:modelValue', value);
  open.value = false;
}

function toggleValue(value: string) {
  const current = [...selectedValues.value];

  if (current.includes(value)) {
    emit(
      'update:modelValue',
      current.filter(v => v !== value)
    );
  } else {
    emit('update:modelValue', [...current, value]);
  }
}
const usesFetcher = computed(() => typeof props.fetcher === 'function');

// Cache so the labels of selected values survive being filtered out. Typed as a
// concrete Ref so Vue's UnwrapRefSimple<T> doesn't rewrite the Map value type
// (which would break the `T` generic at .set()/.get() call sites). Deep ref is
// intentional — `.set()` must trigger the label computeds when options load.
const optionCache = ref(new Map<string, T>()) as Ref<Map<string, T>>;
const cacheOptions = (opts: T[]) =>
  opts.forEach(opt => optionCache.value.set(props.getOptionValue(opt), opt));

const isMulti = computed(() => props.multi);
const selectedValues = computed<string[]>(() =>
  isMulti.value ? ((props.modelValue as string[]) ?? []) : []
);
const selectedValue = computed<string>(() =>
  isMulti.value ? '' : ((props.modelValue as string) ?? '')
);

const searchPlaceholder = computed(
  () =>
    props.searchPlaceholder ||
    (props.label ? `Buscar ${props.label.toLowerCase()}...` : 'Buscar...')
);
const emptyText = computed(
  () =>
    props.notFoundText ||
    props.emptyState ||
    (props.label
      ? `Nenhum ${props.label.toLowerCase()} encontrado.`
      : 'Nada encontrado.')
);

const filteredOptions = computed(() => {
  // Consumer-driven (server-side) search or a fetcher owns the filtering:
  // render exactly what we were given, otherwise the client-side label filter
  // strips out freshly-fetched results (they appear then disappear).
  if (props.useApiResults) {
    return internalOptions.value;
  }

  if (usesFetcher.value && !props.preload) {
    return internalOptions.value;
  }

  const query = searchTerm.value.toLowerCase();

  return internalOptions.value.filter(option =>
    props.getOptionLabel(option).toLowerCase().includes(query)
  );
});

const load = async (query?: string) => {
  if (!props.fetcher) return;
  loading.value = true;
  error.value = null;
  try {
    const data = await props.fetcher(query);
    internalOptions.value = data;
    cacheOptions(data);
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to fetch options';
  } finally {
    loading.value = false;
  }
};

// Static `options` mode: mirror the prop into the rendered list (reka filters).
watch(
  () => props.options,
  opts => {
    if (!usesFetcher.value) {
      internalOptions.value = opts ?? [];
      cacheOptions(internalOptions.value);
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (usesFetcher.value) load();
});

// Re-fetch (server-side search) only when the fetcher owns the filtering.
watch(debouncedSearch, query => {
  emit('search', query ?? '');
  if (usesFetcher.value && !props.preload) load(query);
});

const isSelected = (value: string) =>
  isMulti.value
    ? selectedValues.value.includes(value)
    : selectedValue.value === value;

const labelFor = (value: string) => {
  const option = optionCache.value.get(value);
  return option ? props.getOptionLabel(option) : value;
};

const selectedSingleLabel = computed(() =>
  selectedValue.value ? labelFor(selectedValue.value) : ''
);

const allSelected = computed(
  () =>
    internalOptions.value.length > 0 &&
    selectedValues.value.length === internalOptions.value.length
);

const handleClear = () => emit('update:modelValue', isMulti.value ? [] : '');

const removeValue = (value: string) =>
  emit(
    'update:modelValue',
    selectedValues.value.filter(item => item !== value)
  );

const toggleAll = () => {
  const all = internalOptions.value.map(props.getOptionValue);
  emit('update:modelValue', allSelected.value ? [] : all);
};

const contentStyle = computed(() => ({
  width: props.width || 'var(--reka-popper-anchor-width)',
}));
const triggerStyle = computed(() =>
  props.width ? { width: props.width } : undefined
);
</script>

<template>
  <div
    ref="containerRef"
    :class="cn('relative min-w-0', !width && 'w-full')"
    v-bind="$attrs"
  >
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <!-- Custom trigger (e.g. a "+ tag" button); falls back to the
             default value-showing trigger when no slot is provided. -->
        <slot name="trigger">
          <!-- Single Select -->
          <Button
            v-if="!isMulti"
            type="button"
            variant="outline"
            role="combobox"
            :aria-expanded="open"
            :disabled="disabled"
            :class="
              cn(
                'h-9 w-full justify-between',
                disabled && 'cursor-not-allowed opacity-50',
                hasError &&
                  'border-destructive text-destructive hover:bg-destructive/10',
                triggerClass
              )
            "
          >
            <span class="truncate">
              {{ selectedSingleLabel || placeholder }}
            </span>

            <ChevronsUpDown class="opacity-50" />
          </Button>

          <!-- Multi Select -->
          <div
            v-else
            role="combobox"
            :aria-expanded="open"
            :class="
              cn(
                'border-border bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full min-w-[160px] cursor-pointer items-center justify-between rounded-md border px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2',
                disabled && 'cursor-not-allowed opacity-50',
                hasError &&
                  'border-destructive text-destructive hover:bg-destructive/10'
              )
            "
          >
            <template v-if="selectedValues.length">
              <div
                class="flex max-h-20 min-w-0 flex-1 flex-wrap items-center gap-1 overflow-y-auto pr-2"
              >
                <div
                  v-for="val in selectedValues.slice(0, maxCount)"
                  :key="val"
                  class="hover:text-primary flex h-[26px] flex-shrink-0 items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600"
                >
                  <div
                    class="flex max-w-[100px] items-center gap-1 truncate text-xs"
                  >
                    {{ labelFor(val) }}
                  </div>

                  <X
                    class="box-content h-3 w-3 shrink-0 cursor-pointer rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    @click.stop="removeValue(val)"
                  />
                </div>

                <div
                  v-if="selectedValues.length > maxCount"
                  class="flex-shrink-0"
                >
                  <Badge variant="outline">
                    +{{ selectedValues.length - maxCount }}
                  </Badge>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1">
                <X
                  class="box-content h-3 w-3 shrink-0 cursor-pointer rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  @click.stop="handleClear"
                />

                <div class="bg-border h-5 w-px" />

                <ChevronDown
                  class="size-4 cursor-pointer text-zinc-300 dark:text-zinc-500"
                />
              </div>
            </template>

            <div v-else class="flex w-full items-center justify-between">
              <span class="text-muted-foreground">
                {{ placeholder }}
              </span>

              <ChevronDown
                class="size-4 cursor-pointer text-zinc-300 dark:text-zinc-500"
              />
            </div>
          </div>
        </slot>
      </PopoverTrigger>

      <PopoverContent
        :align="popoverAlign"
        :style="contentStyle"
        :disable-portal="disablePortal"
        class="p-0"
      >
        <!-- We own filtering (static `options`/server-side `fetcher`); disable
             Command's built-in text filter so async results aren't hidden. -->
        <Command :should-filter="false">
          <div class="relative w-full">
            <CommandInput
              v-model="searchTerm"
              :placeholder="searchPlaceholder"
            />

            <div
              v-if="loading && internalOptions.length"
              class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center"
            >
              <Spinner />
            </div>
          </div>

          <CommandList>
            <CommandEmpty>
              <div class="py-6 text-center text-sm">
                {{ error || emptyText }}
              </div>
            </CommandEmpty>

            <CommandGroup
              v-if="loading && !internalOptions.length"
              class="py-4"
            >
              <div class="flex justify-center">
                <Spinner />
              </div>
            </CommandGroup>

            <CommandGroup
              v-if="internalOptions.length"
              class="max-h-[300px] overflow-y-auto"
            >
              <!-- Select All -->
              <CommandItem
                v-if="isMulti && !hideSelectAll && filteredOptions.length"
                :value="SELECT_ALL_VALUE"
                class="cursor-pointer"
                @select="toggleAll"
              >
                <span
                  :class="
                    cn(
                      'border-primary shadow-sm mr-1 flex size-4 items-center justify-center rounded-[4px] border outline-none transition-shadow',
                      allSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible'
                    )
                  "
                >
                  <Check v-if="allSelected" class="size-3.5" />
                </span>

                {{ selectAllLabel }}
              </CommandItem>

              <!-- Options -->
              <CommandItem
                v-for="option in filteredOptions"
                class="cursor-pointer"
                :key="getOptionValue(option)"
                :value="getOptionLabel(option)"
                @select="
                  () =>
                    isMulti
                      ? toggleValue(getOptionValue(option))
                      : selectSingle(getOptionValue(option))
                "
              >
                <span
                  v-if="isMulti"
                  :class="
                    cn(
                      'border-primary shadow-sm mr-1 flex size-4 items-center justify-center rounded-[4px] border outline-none transition-shadow',
                      isSelected(getOptionValue(option))
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible'
                    )
                  "
                >
                  <Check
                    v-if="isSelected(getOptionValue(option))"
                    class="size-3.5"
                  />
                </span>

                <slot name="option" :option="option">
                  <span class="truncate">
                    {{ getOptionLabel(option) }}
                  </span>
                </slot>

                <Check
                  v-if="!isMulti"
                  :class="
                    cn(
                      'ml-auto h-3 w-3',
                      isSelected(getOptionValue(option))
                        ? 'opacity-100'
                        : 'opacity-0'
                    )
                  "
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>

          <!-- Footer — must live INSIDE <Command> so CommandSeparator/
               CommandGroup can inject the CommandContext; otherwise they throw
               ("must be used within Command") the moment a value is selected in
               multi mode, crashing the whole dropdown. -->
          <CommandSeparator v-if="isMulti && selectedValues.length" />

          <CommandGroup v-if="isMulti && selectedValues.length">
            <div class="flex items-center p-1">
              <button
                type="button"
                class="hover:bg-accent flex-1 cursor-pointer rounded-sm px-2 py-1.5 text-center text-sm"
                @click="handleClear"
              >
                {{ clearLabel }}
              </button>

              <div class="bg-border mx-1 h-5 w-px" />

              <button
                type="button"
                class="hover:bg-accent flex-1 cursor-pointer rounded-sm px-2 py-1.5 text-center text-sm"
                @click="open = false"
              >
                {{ closeLabel }}
              </button>
            </div>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>

    <p
      v-if="message"
      class="mt-2 mb-0 truncate text-xs"
      :class="hasError ? 'text-destructive' : ''"
    >
      {{ message }}
    </p>
  </div>
</template>
