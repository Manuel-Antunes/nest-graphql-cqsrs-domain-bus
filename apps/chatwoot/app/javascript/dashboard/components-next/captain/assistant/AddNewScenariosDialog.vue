<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVuelidate } from '@vuelidate/core';
import { required, minLength } from '@vuelidate/validators';

import Input from 'dashboard/components-next/input/Input.vue';
import { Button } from 'dashboard/components-next/ui/button';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';
import Editor from 'dashboard/components-next/Editor/Editor.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const emit = defineEmits(['add']);

const { t } = useI18n();

const isOpen = ref(false);

const state = reactive({
  id: '',
  title: '',
  description: '',
  instruction: '',
});

const rules = {
  title: { required, minLength: minLength(1) },
  description: { required },
  instruction: { required },
};

const v$ = useVuelidate(rules, state);

const titleError = computed(() =>
  v$.value.title.$error
    ? t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.TITLE.ERROR')
    : ''
);

const descriptionError = computed(() =>
  v$.value.description.$error
    ? t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.DESCRIPTION.ERROR')
    : ''
);

const instructionError = computed(() =>
  v$.value.instruction.$error
    ? t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.INSTRUCTION.ERROR')
    : ''
);

const resetState = () => {
  Object.assign(state, {
    id: '',
    title: '',
    description: '',
    instruction: '',
  });
};

const onClickAdd = async () => {
  v$.value.$touch();
  if (v$.value.$invalid) return;

  await emit('add', state);
  resetState();
  isOpen.value = false;
};

const onClickCancel = () => {
  isOpen.value = false;
};
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button class="flex-shrink-0">
        {{ t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.CREATE') }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[31.25rem] p-6 flex flex-col gap-6">
      <h3 class="text-base font-medium text-n-slate-12">
        {{ t(`CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.TITLE`) }}
      </h3>

      <div class="flex flex-col gap-4">
        <Input
          v-model="state.title"
          :label="t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.TITLE.LABEL')"
          :placeholder="
            t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.TITLE.PLACEHOLDER')
          "
          :message="titleError"
          :message-type="titleError ? 'error' : 'info'"
        />

        <TextArea
          v-model="state.description"
          :label="
            t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.DESCRIPTION.LABEL')
          "
          :placeholder="
            t(
              'CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.DESCRIPTION.PLACEHOLDER'
            )
          "
          :message="descriptionError"
          :message-type="descriptionError ? 'error' : 'info'"
          show-character-count
        />
        <Editor
          v-model="state.instruction"
          :label="
            t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.INSTRUCTION.LABEL')
          "
          :placeholder="
            t(
              'CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.INSTRUCTION.PLACEHOLDER'
            )
          "
          :message="instructionError"
          :message-type="instructionError ? 'error' : 'info'"
          :show-character-count="false"
          enable-captain-tools
        />
      </div>

      <div class="flex items-center justify-between w-full gap-3">
        <Button
          variant="outline"
          class="w-full bg-n-alpha-2 !text-primary hover:bg-n-alpha-3"
          @click="onClickCancel"
        >
          {{ t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.CANCEL') }}
        </Button>
        <Button class="w-full" @click="onClickAdd">
          {{ t('CAPTAIN.ASSISTANTS.SCENARIOS.ADD.NEW.FORM.CREATE') }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
