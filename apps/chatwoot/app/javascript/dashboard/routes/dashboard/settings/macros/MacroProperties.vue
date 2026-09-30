<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  macroName: {
    type: String,
    default: '',
  },
  macroVisibility: {
    type: String,
    default: 'global',
  },
  nameError: {
    type: String,
    default: '',
  },
  canManagePublicMacros: {
    type: Boolean,
    default: true,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:name', 'update:visibility', 'submit']);

const { t } = useI18n();

const isPublicVisibilityDisabled = computed(() => !props.canManagePublicMacros);

const publicVisibilityDescription = computed(() => {
  if (props.readOnly) {
    return t('MACROS.EDITOR.VISIBILITY.GLOBAL.EDIT_DISABLED_DESCRIPTION');
  }

  if (isPublicVisibilityDisabled.value) {
    return t('MACROS.EDITOR.VISIBILITY.GLOBAL.CREATE_DISABLED_DESCRIPTION');
  }

  return t('MACROS.EDITOR.VISIBILITY.GLOBAL.DESCRIPTION');
});

const isActive = key =>
  props.macroVisibility === key
    ? 'bg-n-blue-2 dark:bg-n-blue-1 border-n-blue-3 dark:border-n-blue-4'
    : 'bg-white dark:bg-n-solid-2 border-n-weak dark:border-n-strong';

const onUpdateName = value => {
  if (props.readOnly) return;

  emit('update:name', value);
};

const onUpdateVisibility = value => {
  if (props.readOnly) return;
  if (value === 'global' && isPublicVisibilityDisabled.value) return;

  emit('update:visibility', value);
};
</script>

<template>
  <div
    class="p-4 bg-n-solid-2 border border-n-weak rounded-lg shadow-sm h-full flex flex-col"
  >
    <div>
      <div class="flex flex-col gap-1">
        <Label>{{ $t('MACROS.ADD.FORM.NAME.LABEL') }}</Label>
        <Input
          :model-value="macroName"
          :aria-invalid="!!nameError || undefined"
          :placeholder="$t('MACROS.ADD.FORM.NAME.PLACEHOLDER')"
          :readonly="readOnly"
          @update:model-value="onUpdateName"
        />
        <p v-if="nameError" class="text-sm text-n-ruby-9">
          {{ nameError }}
        </p>
      </div>
    </div>
    <div class="mt-2">
      <p class="block m-0 text-sm font-medium leading-[1.8] text-n-slate-12">
        {{ $t('MACROS.EDITOR.VISIBILITY.LABEL') }}
      </p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <button
          type="button"
          class="p-2 relative rounded-md border border-solid justify-between items-start gap-2 flex flex-col text-start"
          :class="isActive('global')"
          :disabled="isPublicVisibilityDisabled || readOnly"
          :aria-describedby="
            isPublicVisibilityDisabled ? 'macro-public-visibility-help' : null
          "
          @click="onUpdateVisibility('global')"
        >
          <div class="flex items-center gap-2 min-w-0 justify-between w-full">
            <p class="block m-0 text-heading-3 text-n-slate-12 line-clamp-1">
              {{ $t('MACROS.EDITOR.VISIBILITY.GLOBAL.LABEL') }}
            </p>
            <Icon
              v-if="macroVisibility === 'global'"
              icon="i-lucide-circle-check-big"
              class="text-n-brand size-4"
            />
          </div>
          <p
            id="macro-public-visibility-help"
            class="text-n-slate-11 text-label-small"
          >
            {{ publicVisibilityDescription }}
          </p>
        </button>
        <button
          type="button"
          class="p-2 relative rounded-md border border-solid justify-between items-start gap-2 flex flex-col text-start"
          :class="isActive('personal')"
          :disabled="readOnly"
          @click="onUpdateVisibility('personal')"
        >
          <div class="flex items-center gap-2 min-w-0 justify-between w-full">
            <p class="block m-0 text-heading-3 text-n-slate-12 line-clamp-1">
              {{ $t('MACROS.EDITOR.VISIBILITY.PERSONAL.LABEL') }}
            </p>
            <Icon
              v-if="macroVisibility === 'personal'"
              icon="i-lucide-circle-check-big"
              class="text-n-brand size-4"
            />
          </div>
          <p class="text-n-slate-11 text-label-small">
            {{ $t('MACROS.EDITOR.VISIBILITY.PERSONAL.DESCRIPTION') }}
          </p>
        </button>
      </div>
      <div
        class="mt-2 flex items-start p-2 bg-n-alpha-1 gap-2 dark:bg-n-solid-3 rounded-md"
      >
        <Icon
          icon="i-lucide-info"
          class="flex-shrink-0 mt-0.5 size-4 text-n-slate-11"
        />
        <p class="mb-0 text-n-slate-11 text-body-para">
          {{ $t('MACROS.ORDER_INFO') }}
        </p>
      </div>
    </div>
    <div class="mt-4 w-full">
      <Button class="w-full" :disabled="readOnly" @click="emit('submit')">
        {{ $t('MACROS.HEADER_BTN_TXT_SAVE') }}
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
:deep(input[type='text']) {
  @apply mb-0;
}

:deep(.error) {
  .message {
    @apply mb-0;
  }
}
</style>
