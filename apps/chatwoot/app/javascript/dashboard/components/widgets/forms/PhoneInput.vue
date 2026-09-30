<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUpdate, nextTick } from 'vue';
import type { StyleValue } from 'vue';
import countries from 'shared/constants/countries.js';
import parsePhoneNumber from 'libphonenumber-js';
import {
  getActiveCountryCode,
  getActiveDialCode,
} from 'shared/components/PhoneInput/helper';

interface Country {
  name: string;
  dial_code: string;
  emoji: string;
  id: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    placeholder?: string;
    readonly?: boolean;
    styles?: StyleValue;
    error?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    readonly: false,
    error: false,
  }
);

const emit = defineEmits<{
  (e: 'blur', value: string): void;
  (e: 'setCode', code: string): void;
  (e: 'update:modelValue', value: string): void;
}>();

const dropdown = ref<HTMLDivElement | null>(null);
const searchbar = ref<HTMLInputElement | null>(null);
const phoneNumberInput = ref<HTMLInputElement | null>(null);
const dropdownItems = ref<HTMLElement[]>([]);
const setDropdownItemRef = (el: unknown, index: number) => {
  if (el) dropdownItems.value[index] = el as HTMLElement;
};
onBeforeUpdate(() => {
  dropdownItems.value = [];
});

const selectedIndex = ref(-1);
const showDropdown = ref(false);
const searchCountry = ref('');
const activeCountryCode = ref<string | undefined>(getActiveCountryCode());
const activeDialCode = ref<string | undefined>(getActiveDialCode());
const phoneNumber = ref(String(props.modelValue));

const dropdownFirstItemName = computed(() =>
  activeCountryCode.value ? 'Clear selection' : 'Select Country'
);

const countriesList = computed<Country[]>(() => [
  {
    name: dropdownFirstItemName.value,
    dial_code: '',
    emoji: '',
    id: '',
  },
  ...countries,
]);

const filteredCountriesBySearch = computed(() =>
  countriesList.value.filter(country => {
    const { name, dial_code, id } = country;
    const search = searchCountry.value.toLowerCase();
    return (
      name.toLowerCase().includes(search) ||
      dial_code.toLowerCase().includes(search) ||
      id.toLowerCase().includes(search)
    );
  })
);

const activeCountry = computed(() => {
  if (activeCountryCode.value) {
    return countriesList.value.find(
      country => country.id === activeCountryCode.value
    );
  }
  return undefined;
});

const closeDropdown = () => {
  selectedIndex.value = -1;
  showDropdown.value = false;
};

const onOutsideClick = (e: Event) => {
  if (
    showDropdown.value &&
    e.target !== dropdown.value &&
    !dropdown.value?.contains(e.target as Node)
  ) {
    closeDropdown();
  }
};

const onChange = (e: Event) => {
  const { value } = e.target as HTMLInputElement;
  phoneNumber.value = value;
  emit('update:modelValue', value);
  emit('setCode', activeDialCode.value ?? '');
};

const onBlur = (e: Event) => {
  emit('blur', (e.target as HTMLInputElement).value);
};

const onSearchCountry = () => {
  // Reset selected index to 0
  selectedIndex.value = 0;
};

const scrollToSelected = () => {
  nextTick(() => {
    const selectedItem = dropdownItems.value[selectedIndex.value];
    const dropdownSearchbarHeight = 40;
    if (selectedItem && dropdown.value) {
      const selectedItemTop = selectedItem.offsetTop;
      dropdown.value.scrollTop = selectedItemTop - dropdownSearchbarHeight;
    }
  });
};

const moveUp = () => {
  if (!showDropdown.value) return;
  selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  scrollToSelected();
};

const moveDown = () => {
  if (!showDropdown.value) return;
  selectedIndex.value = Math.min(
    selectedIndex.value + 1,
    filteredCountriesBySearch.value.length - 1
  );
  scrollToSelected();
};

const onSelectCountry = (country: Country) => {
  if (!country || !showDropdown.value) return;
  activeCountryCode.value = country.id;
  searchCountry.value = '';
  activeDialCode.value = country.dial_code;
  emit('setCode', country.dial_code);
  closeDropdown();
  phoneNumberInput.value?.focus();
};

const setActiveCountry = () => {
  if (!phoneNumber.value) return;
  const number = parsePhoneNumber(phoneNumber.value);
  if (number) {
    activeCountryCode.value = number.country;
    activeDialCode.value = number.countryCallingCode;
  }
};

const toggleCountryDropdown = () => {
  showDropdown.value = !showDropdown.value;
  selectedIndex.value = -1;
  if (showDropdown.value) {
    nextTick(() => {
      searchbar.value?.focus();
    });
  }
};

watch(
  () => props.modelValue,
  () => {
    const number = parsePhoneNumber(String(props.modelValue));
    if (number) {
      activeCountryCode.value = number.country;
      activeDialCode.value = `+${number.countryCallingCode}`;
      phoneNumber.value = String(props.modelValue).replace(
        `+${number.countryCallingCode}`,
        ''
      );
    }
  }
);

onMounted(() => {
  setActiveCountry();
});
</script>

<template>
  <div class="relative phone-input--wrap">
    <div
      class="flex items-center justify-start border-none outline outline-1 rounded-lg bg-n-alpha-black2"
      :class="
        error
          ? 'outline-n-ruby-8 dark:outline-n-ruby-8 hover:outline-n-ruby-9 dark:hover:outline-n-ruby-9 mb-1'
          : 'mb-4 outline-n-weak dark:outline-n-weak hover:outline-n-slate-6 dark:hover:outline-n-slate-6'
      "
    >
      <div
        class="cursor-pointer py-2 pr-1.5 pl-2 rounded-tl-lg rounded-bl-lg flex items-center justify-center gap-1.5 bg-n-solid-3 h-10 w-14"
        @click.prevent="toggleCountryDropdown"
      >
        <h5 v-if="activeCountry" class="mb-0">
          {{ activeCountry.emoji }}
        </h5>
        <fluent-icon v-else icon="globe" class="fluent-icon" size="16" />
        <fluent-icon icon="chevron-down" class="fluent-icon" size="12" />
      </div>
      <span
        v-if="activeDialCode"
        class="flex py-2 ltr:pl-2 rtl:pr-2 text-base font-normal leading-normal text-n-slate-12"
      >
        {{ activeDialCode }}
      </span>
      <input
        ref="phoneNumberInput"
        :value="phoneNumber"
        type="tel"
        class="no-margin !rounded-tl-none !rounded-bl-none !outline-none !border-0 font-normal !w-full !bg-transparent text-base !px-1.5 placeholder:font-normal"
        :placeholder="placeholder"
        :readonly="readonly"
        :style="styles"
        @input="onChange"
        @blur="onBlur"
      />
    </div>
    <div
      v-if="showDropdown"
      ref="dropdown"
      v-on-clickaway="onOutsideClick"
      tabindex="0"
      class="z-10 absolute h-60 w-[12.5rem] shadow-md overflow-y-auto top-10 rounded-lg px-0 pt-0 pb-1 bg-n-alpha-3 backdrop-blur-[100px]"
      @keydown.prevent.up="moveUp"
      @keydown.prevent.down="moveDown"
      @keydown.prevent.enter="
        onSelectCountry(filteredCountriesBySearch[selectedIndex])
      "
    >
      <div
        class="sticky top-0 p-1 bg-white dark:bg-transparent backdrop-blur-[100px]"
      >
        <input
          ref="searchbar"
          v-model="searchCountry"
          type="text"
          :placeholder="$t('GENERAL.PHONE_INPUT.PLACEHOLDER')"
          class="!h-8 !mb-0 !text-sm !outline-n-brand dark:!outline-n-brand"
          @input="onSearchCountry"
        />
      </div>
      <div
        v-for="(country, index) in filteredCountriesBySearch"
        :ref="el => setDropdownItemRef(el, index)"
        :key="index"
        class="flex items-center px-1 py-0 cursor-pointer h-7 hover:bg-n-alpha-1 dark:hover:bg-n-alpha-2"
        :class="{
          'bg-n-alpha-1 dark:bg-n-alpha-2':
            country.id === activeCountryCode || index === selectedIndex,
        }"
        @click="onSelectCountry(country)"
      >
        <span class="mr-1 text-base">{{ country.emoji }}</span>

        <span
          class="max-w-[7.5rem] overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {{ country.name }}
        </span>
        <span class="ml-1 text-xs text-n-slate-11">
          {{ country.dial_code }}
        </span>
      </div>
      <div v-if="filteredCountriesBySearch.length === 0">
        <span
          class="flex items-center justify-center mt-4 text-sm text-n-slate-10"
        >
          {{ $t('GENERAL.PHONE_INPUT.EMPTY_STATE') }}
        </span>
      </div>
    </div>
  </div>
</template>
