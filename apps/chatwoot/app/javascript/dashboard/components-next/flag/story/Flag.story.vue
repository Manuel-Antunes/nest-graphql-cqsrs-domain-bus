<script setup>
import { ref } from 'vue';
import Flag from '../Flag.vue';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import countries from 'shared/constants/countries';

const BasicTemplate = {
  components: { Flag },
  props: {
    country: {
      type: String,
      default: 'us',
    },
    squared: {
      type: Boolean,
      default: false,
    },
  },
  template: `
    <div class="flex items-center gap-4 p-4 border rounded border-n-weak">
      <Flag :country="country" :squared="squared" />
    </div>
  `,
};

const SizeVariants = {
  components: { Flag, Checkbox },
  setup() {
    const isSquared = ref(false);
    return { isSquared };
  },
  template: `
    <div class="flex flex-col gap-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <Checkbox id="size-squared" v-model:checked="isSquared" />
        <span class="text-sm" for="size-squared">Squared flags</span>
      </label>
      <div class="flex items-center gap-4 p-4 border rounded border-n-weak">
        <Flag country="in" class="!size-4" :squared="isSquared" />
        <Flag country="in" class="!size-6" :squared="isSquared" />
        <Flag country="in" class="!size-8" :squared="isSquared" />
        <Flag country="in" class="!size-10" :squared="isSquared" />
      </div>
    </div>
  `,
};

const AllFlags = {
  components: { Flag, Checkbox },
  setup() {
    const isSquared = ref(false);
    return { countries, isSquared };
  },
  template: `
    <div class="flex flex-col gap-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <Checkbox id="all-squared" v-model:checked="isSquared" />
        <span class="text-sm" for="all-squared">Squared flags</span>
      </label>

      <div class="grid grid-cols-2 gap-4 p-4 border rounded border-n-strong md:grid-cols-3 lg:grid-cols-4">
        <div
          v-for="country in countries"
          :key="country.id"
          class="flex items-center gap-2 px-4 py-2 border rounded border-n-strong"
        >
          <Flag
            :country="country.id"
            :squared="isSquared"
            class="size-6"
          />
          <span class="text-sm">{{ country.name }}</span>
        </div>
      </div>
    </div>
  `,
};
</script>

<template>
  <Story title="Components/Flag">
    <Variant title="Basic Usage">
      <BasicTemplate country="us" :squared="false" />
    </Variant>

    <Variant title="Size Variants">
      <SizeVariants />
    </Variant>

    <Variant title="All Flags">
      <AllFlags />
    </Variant>
  </Story>
</template>
