<!-- Attribute type "Text, URL, Number" -->
<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVuelidate } from '@vuelidate/core';
import { required } from '@vuelidate/validators';
import { isValidURL } from 'dashboard/helper/URLHelper.js';
import { getRegexp } from 'shared/helpers/Validators';

import { Input } from 'dashboard/components-next/ui/input';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  attribute: {
    type: Object,
    required: true,
  },
  isEditingView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update', 'delete']);

const { t } = useI18n();
const isEditingValue = ref(false);
const editedValue = ref(props.attribute.value || '');

const isAttributeTypeLink = computed(
  () => props.attribute.attributeDisplayType === 'link'
);

const isAttributeTypeText = computed(
  () => props.attribute.attributeDisplayType === 'text'
);

const isAttributeTypeNumber = computed(
  () => props.attribute.attributeDisplayType === 'number'
);

const rules = computed(() => ({
  editedValue: {
    required,
    ...(isAttributeTypeLink.value && {
      url: value => !value || isValidURL(value),
    }),
    ...(isAttributeTypeText.value &&
      props.attribute.regexPattern && {
        regexValidation: value => {
          if (!value) return true;
          try {
            return getRegexp(props.attribute.regexPattern).test(value);
          } catch {
            return false;
          }
        },
      }),
  },
}));

const v$ = useVuelidate(rules, { editedValue });

const hasError = computed(() => v$.value.$error);

const attributeErrorMessage = computed(() => {
  if (!hasError.value) return '';

  if (isAttributeTypeLink.value && v$.value.editedValue.url?.$invalid) {
    return t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.VALIDATIONS.INVALID_URL');
  }

  if (
    isAttributeTypeText.value &&
    props.attribute.regexPattern &&
    v$.value.editedValue.regexValidation?.$invalid
  ) {
    return (
      props.attribute.regexCue ||
      t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.VALIDATIONS.INVALID_INPUT')
    );
  }

  if (isAttributeTypeNumber.value && v$.value.editedValue.required?.$invalid) {
    return t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.VALIDATIONS.INVALID_NUMBER');
  }

  return t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.VALIDATIONS.REQUIRED');
});

const getInputType = computed(() => {
  switch (props.attribute.attributeDisplayType) {
    case 'link':
      return 'url';
    case 'number':
      return 'number';
    default:
      return 'text';
  }
});

const toggleEditValue = value => {
  isEditingValue.value =
    typeof value === 'boolean' ? value : !isEditingValue.value;
  if (isEditingValue.value) {
    v$.value.$reset();
    editedValue.value = props.attribute.value || '';
  }
};

const handleInputUpdate = async () => {
  const isValid = await v$.value.$validate();
  if (!isValid) return;

  emit('update', editedValue.value);
  toggleEditValue(false);
};
</script>

<template>
  <div
    class="flex w-full min-w-0 gap-2"
    :class="{
      'justify-start': isEditingView,
      'justify-end': !isEditingView,
    }"
  >
    <!-- class="min-w-0 text-sm"
      :class="{
        'cursor-pointer text-n-slate-11 hover:text-n-slate-12 py-2 select-none font-medium':
          !isEditingView,
        'text-n-slate-12 truncate': isEditingView && !isAttributeTypeLink,
        'truncate hover:text-n-brand text-n-blue-11':
          isEditingView && isAttributeTypeLink,
      }" -->
    <Button
      v-if="!isEditingValue"
      :variant="isAttributeTypeLink ? 'link' : 'outline'"
      @click="toggleEditValue(!isEditingView)"
    >
      <a
        v-if="isAttributeTypeLink && attribute.value && isEditingView"
        :href="attribute.value"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
      >
        {{ attribute.value }}
      </a>
      <template v-else>
        {{
          attribute.value ||
          t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.INPUT')
        }}
      </template>
    </Button>

    <div
      v-if="isEditingView && !isEditingValue"
      class="flex items-center gap-2"
    >
      <Button variant="outline" size="icon" @click="toggleEditValue(true)">
        <Icon icon="i-lucide-pencil" />
      </Button>
      <Button variant="destructive" size="icon" @click="emit('delete')">
        <Icon icon="i-lucide-trash" />
      </Button>
    </div>

    <div
      v-if="isEditingValue"
      v-on-clickaway="() => toggleEditValue(false)"
      class="flex w-full gap-2 items-center"
    >
      <Input
        v-model="editedValue"
        :placeholder="t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.INPUT')"
        :type="getInputType"
        autofocus
        :message="attributeErrorMessage"
        :message-type="hasError ? 'error' : 'info'"
        @keyup.enter="handleInputUpdate"
      />
      <!-- TODO: dynamic color/variant – review manually -->
      <Button size="icon" class="shrink-0" @click="handleInputUpdate">
        <Icon icon="i-lucide-check" />
      </Button>
    </div>
  </div>
</template>
