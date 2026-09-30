<script>
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';

export default {
  components: {
    Button,
    Input,
    Label,
  },
  props: {
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
  },
  emits: ['update:name', 'update:visibility', 'submit'],
  methods: {
    isActive(key) {
      return this.macroVisibility === key
        ? 'bg-n-blue-2 dark:bg-n-blue-1 border-n-blue-3 dark:border-n-blue-4'
        : 'bg-white dark:bg-n-solid-2 border-n-weak dark:border-n-strong';
    },
    onUpdateName(value) {
      this.$emit('update:name', value);
    },
    onUpdateVisibility(value) {
      this.$emit('update:visibility', value);
    },
  },
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
          class="p-2 relative rounded-md border border-solid text-left cursor-default"
          :class="isActive('global')"
          @click="onUpdateVisibility('global')"
        >
          <fluent-icon
            v-if="macroVisibility === 'global'"
            icon="checkmark-circle"
            type="solid"
            class="absolute text-n-brand top-2 right-2"
          />
          <p
            class="block m-0 text-sm font-medium leading-[1.8] text-n-slate-12"
          >
            {{ $t('MACROS.EDITOR.VISIBILITY.GLOBAL.LABEL') }}
          </p>
          <p class="text-xs text-n-slate-11">
            {{ $t('MACROS.EDITOR.VISIBILITY.GLOBAL.DESCRIPTION') }}
          </p>
        </button>
        <button
          class="p-2 relative rounded-md border border-solid text-left cursor-default"
          :class="isActive('personal')"
          @click="onUpdateVisibility('personal')"
        >
          <fluent-icon
            v-if="macroVisibility === 'personal'"
            icon="checkmark-circle"
            type="solid"
            class="absolute text-n-brand top-2 right-2"
          />
          <p
            class="block m-0 text-sm font-medium leading-[1.8] text-n-slate-12"
          >
            {{ $t('MACROS.EDITOR.VISIBILITY.PERSONAL.LABEL') }}
          </p>
          <p class="text-xs text-n-slate-11">
            {{ $t('MACROS.EDITOR.VISIBILITY.PERSONAL.DESCRIPTION') }}
          </p>
        </button>
      </div>
      <div
        class="mt-2 flex items-start p-2 bg-n-slate-3 dark:bg-n-solid-3 rounded-md"
      >
        <fluent-icon icon="info" size="16" class="flex-shrink-0 mt-0.5" />
        <p class="ml-2 rtl:ml-0 rtl:mr-2 mb-0 text-n-slate-11">
          {{ $t('MACROS.ORDER_INFO') }}
        </p>
      </div>
    </div>
    <div class="mt-auto w-full">
      <Button class="w-full" @click="$emit('submit')">{{
        $t('MACROS.HEADER_BTN_TXT_SAVE')
      }}</Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
::v-deep input[type='text'] {
  @apply mb-0;
}

::v-deep .error {
  .message {
    @apply mb-0;
  }
}
</style>
