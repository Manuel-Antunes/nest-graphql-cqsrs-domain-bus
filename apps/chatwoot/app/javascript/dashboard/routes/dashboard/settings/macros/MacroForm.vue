<script setup>
import { ref, computed, watch } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import * as z from 'zod';
import MacroNodes from './MacroNodes.vue';
import MacroProperties from './MacroProperties.vue';
import { validateActions } from 'dashboard/helper/validations';

const props = defineProps({
  macroData: {
    type: Object,
    default: () => ({}),
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

const emit = defineEmits(['submit']);

const { currentPath } = useAppNavigation();
const { t } = useI18n();

const macro = ref(props.macroData);
const errors = ref({});
const nameError = ref('');

const files = computed(() => macro.value?.files || []);

const removeObjectProperty = (obj, keyToRemove) =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => key !== keyToRemove)
  );

const validateName = () => {
  const isValid = z.string().min(1).safeParse(macro.value.name).success;
  nameError.value = isValid ? '' : t('MACROS.ADD.FORM.NAME.ERROR');
  return isValid;
};

const resetValidation = () => {
  errors.value = {};
  nameError.value = '';
};

watch(
  () => currentPath.value,
  () => resetValidation(),
  { immediate: true }
);

watch(
  () => props.macroData,
  value => {
    macro.value = value;
  },
  { immediate: true }
);

const updateName = value => {
  macro.value.name = value;
  if (nameError.value) validateName();
};

const updateVisibility = value => {
  macro.value.visibility = value;
};

const appendNode = () => {
  macro.value.actions.push({
    action_name: 'assign_team',
    action_params: [],
  });
};

const deleteNode = index => {
  // remove that index specifically so the next item is not marked invalid
  errors.value = removeObjectProperty(errors.value, `action_${index}`);
  macro.value.actions.splice(index, 1);
};

const resetNode = index => {
  errors.value = removeObjectProperty(errors.value, `action_${index}`);
  macro.value.actions[index].action_params = [];
};

const submit = () => {
  errors.value = validateActions(macro.value.actions);
  const isNameValid = validateName();
  if (Object.keys(errors.value).length !== 0 || !isNameValid) return;

  emit('submit', macro.value);
};
</script>

<template>
  <div class="flex flex-col w-full h-auto lg:flex-row lg:h-full">
    <div
      class="flex-1 w-full h-full max-h-full ltr:pl-12 ltr:pr-6 rtl:pl-6 rtl:pr-12 py-4 overflow-y-auto lg:w-auto macro-gradient-radial dark:macro-dark-gradient-radial macro-gradient-radial-size"
    >
      <div :inert="readOnly" :class="{ 'opacity-75': readOnly }">
        <MacroNodes
          v-model="macro.actions"
          :files="files"
          :errors="errors"
          @add-new-node="appendNode"
          @delete-node="deleteNode"
          @reset-action="resetNode"
        />
      </div>
    </div>
    <div class="w-full lg:w-1/3 pb-4">
      <MacroProperties
        :macro-name="macro.name"
        :macro-visibility="macro.visibility"
        :name-error="nameError"
        :can-manage-public-macros="canManagePublicMacros"
        :read-only="readOnly"
        @update:name="updateName"
        @update:visibility="updateVisibility"
        @submit="submit"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@layer components {
  .macro-gradient-radial {
    background-image: radial-gradient(#ebf0f5 1.2px, transparent 0);
  }

  .macro-dark-gradient-radial {
    background-image: radial-gradient(#293f51 1.2px, transparent 0);
  }

  .macro-gradient-radial-size {
    background-size: 1rem 1rem;
  }
}
</style>
