<script setup>
import { computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { convertToAttributeSlug } from 'dashboard/helper/commons.js';
import { ATTRIBUTE_MODELS, ATTRIBUTE_TYPES } from './constants';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Textarea } from 'dashboard/components-next/ui/textarea';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from 'dashboard/components-next/ui/tags-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  onClose: {
    type: Function,
    default: () => {},
  },
  // Passes 0 or 1 based on the selected AttributeModel tab selected in the UI
  selectedAttributeModelTab: {
    type: Number,
    default: 0,
  },
});

const store = useStore();
const { t } = useI18n();

const uiFlags = useMapGetter('getUIFlags');

const models = computed(() =>
  ATTRIBUTE_MODELS.map(item => ({
    ...item,
    option: t(`ATTRIBUTES_MGMT.ATTRIBUTE_MODELS.${item.key}`),
  }))
);
const types = computed(() =>
  ATTRIBUTE_TYPES.map(item => ({
    ...item,
    option: t(`ATTRIBUTES_MGMT.ATTRIBUTE_TYPES.${item.key}`),
  }))
);

const validationSchema = toTypedSchema(
  z
    .object({
      displayName: z.string().min(1, t('ATTRIBUTES_MGMT.ADD.FORM.NAME.ERROR')),
      attributeKey: z
        .string()
        .min(1, t('ATTRIBUTES_MGMT.ADD.FORM.KEY.ERROR'))
        .refine(
          value => !value.includes(' '),
          t('ATTRIBUTES_MGMT.ADD.FORM.KEY.IN_VALID')
        ),
      description: z.string().min(1, t('ATTRIBUTES_MGMT.ADD.FORM.DESC.ERROR')),
      attributeModel: z
        .string()
        .min(1, t('ATTRIBUTES_MGMT.ADD.FORM.MODEL.ERROR')),
      attributeType: z
        .string()
        .min(1, t('ATTRIBUTES_MGMT.ADD.FORM.TYPE.ERROR')),
      // `.optional()` (not `.default()`): these two fields are conditionally
      // rendered (values → list type, regexEnabled → text type), and
      // vee-validate drops a field's value when its FormField unmounts. With a
      // required schema the unmounted field becomes `undefined` and fails
      // validation with an *invisible* error (its FormMessage is unmounted too),
      // silently disabling submit. `.default()` would fix the value but crashes
      // @vee-validate/zod's getDefaults() under zod v4, so optional it is.
      values: z.array(z.string()).optional(),
      regexEnabled: z.boolean().optional(),
      regexPattern: z.string().nullish(),
      regexCue: z.string().nullish(),
    })
    .superRefine((data, ctx) => {
      if (data.attributeType === '6' && (data.values?.length ?? 0) === 0) {
        ctx.addIssue({
          path: ['values'],
          code: z.ZodIssueCode.custom,
          message: t('ATTRIBUTES_MGMT.ADD.FORM.TYPE.LIST.ERROR'),
        });
      }
    })
);

const initialValues = {
  displayName: '',
  attributeKey: '',
  description: '',
  attributeModel: String(props.selectedAttributeModelTab || 0),
  attributeType: '0',
  values: [],
  regexEnabled: false,
  regexPattern: null,
  regexCue: null,
};

const onDisplayNameInput = (value, handleChange, setFieldValue) => {
  handleChange(value);
  setFieldValue('attributeKey', convertToAttributeSlug(value || ''));
};

const addAttributes = async values => {
  const regexEnabled = values.regexEnabled;
  const regexPattern = regexEnabled ? values.regexPattern : null;
  const regexCue = regexEnabled ? values.regexCue : null;

  try {
    await store.dispatch('attributes/create', {
      attribute_display_name: values.displayName,
      attribute_description: values.description,
      attribute_model: Number(values.attributeModel),
      attribute_display_type: Number(values.attributeType),
      attribute_key: values.attributeKey,
      attribute_values: values.values || [],
      regex_pattern: regexPattern ? new RegExp(regexPattern).toString() : null,
      regex_cue: regexCue,
    });
    useAlert(t('ATTRIBUTES_MGMT.ADD.API.SUCCESS_MESSAGE'));
    props.onClose();
  } catch (error) {
    useAlert(error?.message || t('ATTRIBUTES_MGMT.ADD.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <Dialog
    open
    @update:open="
      val => {
        if (!val) onClose();
      }
    "
  >
    <DialogContent>
      <div class="flex flex-col h-auto overflow-auto">
        <DialogHeader>
          <DialogTitle>{{ $t('ATTRIBUTES_MGMT.ADD.TITLE') }}</DialogTitle>
        </DialogHeader>

        <Form
          v-slot="{ values, setFieldValue, meta }"
          :validation-schema="validationSchema"
          :initial-values="initialValues"
          class="flex flex-col w-full gap-4 mt-4"
          @submit="addAttributes"
        >
          <FormField v-slot="{ componentField }" name="attributeModel">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.MODEL.LABEL') }}
              </FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem
                    v-for="model in models"
                    :key="model.id"
                    :value="String(model.id)"
                  >
                    {{ model.option }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField
            v-slot="{ value, handleChange, handleBlur }"
            name="displayName"
          >
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.NAME.LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  :model-value="value"
                  type="text"
                  :placeholder="$t('ATTRIBUTES_MGMT.ADD.FORM.NAME.PLACEHOLDER')"
                  @update:model-value="
                    val => onDisplayNameInput(val, handleChange, setFieldValue)
                  "
                  @blur="handleBlur"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="attributeKey">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.KEY.LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="text"
                  :placeholder="$t('ATTRIBUTES_MGMT.ADD.FORM.KEY.PLACEHOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="description">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.DESC.LABEL') }}
              </FormLabel>
              <FormControl>
                <Textarea
                  v-bind="componentField"
                  :rows="3"
                  :placeholder="$t('ATTRIBUTES_MGMT.ADD.FORM.DESC.PLACEHOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="attributeType">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.TYPE.LABEL') }}
              </FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem
                    v-for="type in types"
                    :key="type.id"
                    :value="String(type.id)"
                  >
                    {{ type.option }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField
            v-if="values.attributeType === '6'"
            v-slot="{ value, handleChange }"
            name="values"
          >
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.TYPE.LIST.LABEL') }}
              </FormLabel>
              <FormControl>
                <TagsInput
                  :model-value="value || []"
                  @update:model-value="handleChange"
                >
                  <TagsInputItem
                    v-for="item in value || []"
                    :key="item"
                    :value="item"
                  >
                    <TagsInputItemText />
                    <TagsInputItemDelete />
                  </TagsInputItem>
                  <TagsInputInput
                    :placeholder="
                      $t('ATTRIBUTES_MGMT.ADD.FORM.TYPE.LIST.PLACEHOLDER')
                    "
                  />
                </TagsInput>
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField
            v-if="values.attributeType === '0'"
            v-slot="{ value, handleChange }"
            name="regexEnabled"
          >
            <FormItem class="flex flex-row items-center w-full gap-2 space-y-0">
              <FormControl>
                <Checkbox :checked="value" @update:checked="handleChange" />
              </FormControl>
              <FormLabel>
                {{ $t('ATTRIBUTES_MGMT.ADD.FORM.ENABLE_REGEX.LABEL') }}
              </FormLabel>
            </FormItem>
          </FormField>

          <template v-if="values.attributeType === '0' && values.regexEnabled">
            <FormField v-slot="{ componentField }" name="regexPattern">
              <FormItem class="w-full">
                <FormLabel>
                  {{ $t('ATTRIBUTES_MGMT.ADD.FORM.REGEX_PATTERN.LABEL') }}
                </FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    type="text"
                    :placeholder="
                      $t('ATTRIBUTES_MGMT.ADD.FORM.REGEX_PATTERN.PLACEHOLDER')
                    "
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="regexCue">
              <FormItem class="w-full">
                <FormLabel>
                  {{ $t('ATTRIBUTES_MGMT.ADD.FORM.REGEX_CUE.LABEL') }}
                </FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    type="text"
                    :placeholder="
                      $t('ATTRIBUTES_MGMT.ADD.FORM.REGEX_CUE.PLACEHOLDER')
                    "
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </template>

          <DialogFooter>
            <DialogClose as-child>
              <Button variant="outline" type="button">
                {{ $t('ATTRIBUTES_MGMT.ADD.CANCEL_BUTTON_TEXT') }}
              </Button>
            </DialogClose>
            <Button type="submit" :disabled="!meta.valid || uiFlags.isCreating">
              <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
              <template v-if="!uiFlags.isCreating">
                {{ $t('ATTRIBUTES_MGMT.ADD.SUBMIT') }}
              </template>
            </Button>
          </DialogFooter>
        </Form>
      </div>
    </DialogContent>
  </Dialog>
</template>
