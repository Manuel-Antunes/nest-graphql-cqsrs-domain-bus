<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';

const emit = defineEmits(['assign']);

const { t } = useI18n();

const labels = useMapGetter('labels/getLabels');

const query = ref('');
const selectedLabels = ref([]);

const filteredLabels = computed(() => {
  if (!query.value) return labels.value;
  return labels.value.filter(label =>
    label.title.toLowerCase().includes(query.value.toLowerCase())
  );
});

const hasLabels = computed(() => labels.value.length > 0);
const hasFilteredLabels = computed(() => filteredLabels.value.length > 0);

const isLabelSelected = label => {
  return selectedLabels.value.includes(label);
};

const toggleLabel = (label, checked) => {
  if (checked) {
    if (!selectedLabels.value.includes(label)) selectedLabels.value.push(label);
  } else {
    selectedLabels.value = selectedLabels.value.filter(item => item !== label);
  }
};

const handleAssign = () => {
  if (selectedLabels.value.length > 0) {
    emit('assign', selectedLabels.value);
  }
};
</script>

<template>
  <div>
    <div class="flex items-center p-2.5">
      <span class="text-sm font-medium">{{
        t('BULK_ACTION.LABELS.ASSIGN_LABELS')
      }}</span>
    </div>
    <div class="flex flex-col max-h-60 min-h-0">
      <header class="py-2 px-2.5">
        <Input
          v-model="query"
          :placeholder="t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
          class="w-full"
          :aria-label="t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
        />
      </header>
      <ul
        v-if="hasLabels"
        class="flex-1 overflow-y-auto m-0 list-none"
        role="listbox"
        :aria-label="t('BULK_ACTION.LABELS.ASSIGN_LABELS')"
      >
        <li v-if="!hasFilteredLabels" class="p-2 text-center">
          <span class="text-sm text-n-slate-11">{{
            t('BULK_ACTION.LABELS.NO_LABELS_FOUND')
          }}</span>
        </li>
        <li
          v-for="label in filteredLabels"
          :key="label.id"
          class="my-1 mx-0 py-0 px-2.5"
          role="option"
          :aria-selected="isLabelSelected(label.title)"
        >
          <label
            class="items-center rounded-md cursor-pointer flex py-1 px-2.5 hover:bg-n-slate-3 dark:hover:bg-n-solid-3 has-[[data-state=checked]]:bg-n-slate-2"
          >
            <Checkbox
              :checked="isLabelSelected(label.title)"
              class="ltr:mr-2.5 rtl:ml-2.5"
              :aria-label="label.title"
              @update:checked="checked => toggleLabel(label.title, checked)"
            />
            <span
              class="overflow-hidden flex-grow w-full text-sm whitespace-nowrap text-ellipsis"
            >
              {{ label.title }}
            </span>
            <span
              class="rounded-md h-3 w-3 flex-shrink-0 border border-solid border-n-weak"
              :style="{ backgroundColor: label.color }"
            />
          </label>
        </li>
      </ul>
      <div v-else class="p-2 text-center">
        <span class="text-sm text-n-slate-11">{{
          t('CONTACTS_BULK_ACTIONS.NO_LABELS_FOUND')
        }}</span>
      </div>
      <footer class="p-2">
        <Button
          type="submit"
          class="w-full"
          :disabled="!selectedLabels.length"
          @click="handleAssign"
          >{{ t('BULK_ACTION.LABELS.ASSIGN_SELECTED_LABELS') }}
        </Button>
      </footer>
    </div>
  </div>
</template>
