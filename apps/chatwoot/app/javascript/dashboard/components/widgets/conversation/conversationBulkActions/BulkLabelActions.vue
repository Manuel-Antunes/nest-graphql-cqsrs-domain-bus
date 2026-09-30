<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from 'dashboard/components-next/ui/command';

const props = defineProps({
  type: {
    type: String,
    default: 'conversation',
  },
  action: {
    type: String,
    default: 'assign',
    validator: value => ['assign', 'remove'].includes(value),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  appliedLabels: {
    type: Array,
    default: null,
  },
});

const emit = defineEmits(['assign', 'remove']);

const { t } = useI18n();

const labels = useMapGetter('labels/getLabels');

const isOpen = ref(false);
const selectedLabels = ref([]);

const isTypeContact = computed(() => props.type === 'contact');
const isRemoveAction = computed(() => props.action === 'remove');

const buttonLabel = computed(() => {
  if (!isTypeContact.value) return '';

  return isRemoveAction.value
    ? t('CONTACTS_BULK_ACTIONS.REMOVE_LABELS')
    : t('CONTACTS_BULK_ACTIONS.ASSIGN_LABELS');
});

const tooltipLabel = computed(() =>
  isRemoveAction.value
    ? t('BULK_ACTION.LABELS.REMOVE_LABELS')
    : t('BULK_ACTION.LABELS.ASSIGN_LABELS')
);

const confirmLabel = computed(() =>
  isRemoveAction.value
    ? t('BULK_ACTION.LABELS.REMOVE_SELECTED_LABELS')
    : t('BULK_ACTION.LABELS.ASSIGN_SELECTED_LABELS')
);

const isLabelSelected = labelTitle => {
  return selectedLabels.value.includes(labelTitle);
};

const visibleLabels = computed(() => {
  if (!isRemoveAction.value || props.appliedLabels === null) {
    return labels.value;
  }

  const applied = new Set(props.appliedLabels);
  return labels.value.filter(label => applied.has(label.title));
});

const toggleLabelSelection = labelTitle => {
  const index = selectedLabels.value.indexOf(labelTitle);
  if (index > -1) {
    selectedLabels.value.splice(index, 1);
  } else {
    selectedLabels.value.push(labelTitle);
  }
};

const onOpenChange = value => {
  isOpen.value = value;
  if (!value) selectedLabels.value = [];
};

const handleApply = () => {
  if (selectedLabels.value.length > 0) {
    if (isRemoveAction.value) {
      emit('remove', selectedLabels.value);
    } else {
      emit('assign', selectedLabels.value);
    }
    onOpenChange(false);
  }
};
</script>

<template>
  <Popover :open="isOpen" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <Button
        v-tooltip="tooltipLabel"
        variant="outline"
        :size="isTypeContact ? 'sm' : 'icon'"
        :class="{ 'bg-n-alpha-2': isOpen }"
        :disabled="disabled || isLoading"
      >
        <Spinner v-if="isLoading" class="size-4" />
        <Icon
          v-else
          :icon="isRemoveAction ? 'i-woot-tag-remove' : 'i-lucide-tag'"
        />
        <span v-if="buttonLabel" class="hidden md:inline">
          {{ buttonLabel }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent
      :align="isTypeContact ? 'end' : 'center'"
      :side="isTypeContact ? 'bottom' : 'top'"
      class="w-60 p-0"
    >
      <Command>
        <CommandInput
          :placeholder="t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
        />
        <CommandList class="max-h-60">
          <CommandEmpty>
            {{ t('BULK_ACTION.LABELS.NO_LABELS_FOUND') }}
          </CommandEmpty>
          <CommandGroup>
            <CommandItem
              v-for="label in visibleLabels"
              :key="label.id"
              :value="label.title"
              @select="toggleLabelSelection(label.title)"
            >
              <span
                class="rounded-md size-3 flex-shrink-0 border border-solid border-n-weak"
                :style="{ backgroundColor: label.color }"
              />
              <span class="flex-1 min-w-0 truncate">{{ label.title }}</span>
              <Icon
                v-if="isLabelSelected(label.title)"
                icon="i-lucide-check"
                class="size-4 flex-shrink-0"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <div class="p-2 border-t border-border">
        <Button
          class="w-full"
          :disabled="!selectedLabels.length"
          @click="handleApply"
        >
          {{ confirmLabel }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
