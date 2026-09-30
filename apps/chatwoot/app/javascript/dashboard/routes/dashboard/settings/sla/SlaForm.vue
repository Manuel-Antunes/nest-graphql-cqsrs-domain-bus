<script setup>
import { ref, reactive, onMounted } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { convertSecondsToTimeUnit } from '@chatwoot/utils';
import SlaTimeInput from './SlaTimeInput.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Switch } from 'dashboard/components-next/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  selectedResponse: {
    type: Object,
    default: () => ({}),
  },
  submitLabel: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['close', 'submitSla']);

const { t } = useI18n();

const uiFlags = useMapGetter('sla/getUIFlags');

const slaForm = ref(null);
const onlyDuringBusinessHours = ref(false);
const slaTimeInputsValidation = reactive({});
const isSlaTimeInputsInvalid = ref(false);

const slaTimeInputs = reactive([
  {
    threshold: null,
    unit: 'Minutes',
    label: 'SLA.FORM.FIRST_RESPONSE_TIME.LABEL',
    placeholder: 'SLA.FORM.FIRST_RESPONSE_TIME.PLACEHOLDER',
  },
  {
    threshold: null,
    unit: 'Minutes',
    label: 'SLA.FORM.NEXT_RESPONSE_TIME.LABEL',
    placeholder: 'SLA.FORM.NEXT_RESPONSE_TIME.PLACEHOLDER',
  },
  {
    threshold: null,
    unit: 'Minutes',
    label: 'SLA.FORM.RESOLUTION_TIME.LABEL',
    placeholder: 'SLA.FORM.RESOLUTION_TIME.PLACEHOLDER',
  },
]);

const validationSchema = toTypedSchema(
  z.object({
    name: z
      .string()
      .min(1, t('SLA.FORM.NAME.REQUIRED_ERROR'))
      .min(2, t('SLA.FORM.NAME.MINIMUM_LENGTH_ERROR')),
    description: z.string().optional(),
  })
);

const initialValues = {
  name: '',
  description: '',
};

const onClose = () => emit('close');

const setFormValues = () => {
  const {
    name,
    description,
    first_response_time_threshold: firstResponseTimeThreshold,
    next_response_time_threshold: nextResponseTimeThreshold,
    resolution_time_threshold: resolutionTimeThreshold,
    only_during_business_hours: businessHours,
  } = props.selectedResponse;

  slaForm.value?.setValues({
    name: name || '',
    description: description || '',
  });
  onlyDuringBusinessHours.value = businessHours || false;

  const thresholds = [
    firstResponseTimeThreshold,
    nextResponseTimeThreshold,
    resolutionTimeThreshold,
  ];
  slaTimeInputs.forEach((input, index) => {
    const converted = convertSecondsToTimeUnit(thresholds[index], {
      minute: 'Minutes',
      hour: 'Hours',
      day: 'Days',
    });
    input.threshold = converted.time;
    input.unit = converted.unit;
  });
};

onMounted(() => {
  if (props.selectedResponse && Object.keys(props.selectedResponse).length) {
    setFormValues();
  }
});

const updateThreshold = (index, value) => {
  slaTimeInputs[index].threshold = value;
};

const updateUnit = (index, unit) => {
  slaTimeInputs[index].unit = unit;
};

const checkValidationState = () => {
  isSlaTimeInputsInvalid.value = Object.values(slaTimeInputsValidation).some(
    isInvalid => isInvalid
  );
};

const handleIsInvalid = (index, isInvalid) => {
  slaTimeInputsValidation[index] = isInvalid;
  checkValidationState();
};

const convertToSeconds = index => {
  const { threshold, unit } = slaTimeInputs[index];
  if (threshold === null || threshold === 0) return null;
  const unitsToSeconds = { Minutes: 60, Hours: 3600, Days: 86400 };
  return Number(threshold * (unitsToSeconds[unit] || 1));
};

const onSubmit = values => {
  if (isSlaTimeInputsInvalid.value) return;
  emit('submitSla', {
    name: values.name,
    description: values.description,
    first_response_time_threshold: convertToSeconds(0),
    next_response_time_threshold: convertToSeconds(1),
    resolution_time_threshold: convertToSeconds(2),
    only_during_business_hours: onlyDuringBusinessHours.value,
  });
};
</script>

<template>
  <div class="flex flex-col h-auto overflow-auto">
    <Form
      ref="slaForm"
      v-slot="{ meta }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-col mx-0 gap-4"
      @submit="onSubmit"
    >
      <FormField v-slot="{ componentField }" name="name">
        <FormItem class="w-full">
          <FormLabel>{{ $t('SLA.FORM.NAME.LABEL') }}</FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              :placeholder="$t('SLA.FORM.NAME.PLACEHOLDER')"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem class="w-full">
          <FormLabel>{{ $t('SLA.FORM.DESCRIPTION.LABEL') }}</FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              :placeholder="$t('SLA.FORM.DESCRIPTION.PLACEHOLDER')"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <SlaTimeInput
        v-for="(input, index) in slaTimeInputs"
        :key="index"
        :threshold="input.threshold"
        :threshold-unit="input.unit"
        :label="$t(input.label)"
        :placeholder="$t(input.placeholder)"
        @update-threshold="updateThreshold(index, $event)"
        @unit="updateUnit(index, $event)"
        @is-in-valid="handleIsInvalid(index, $event)"
      />

      <div
        class="flex h-10 items-center text-sm w-full gap-2 border border-solid border-n-strong px-3 py-1.5 rounded-xl justify-between"
      >
        <Label for="sla_bh" class="text-n-slate-11 font-normal">
          {{ $t('SLA.FORM.BUSINESS_HOURS.PLACEHOLDER') }}
        </Label>
        <Switch id="sla_bh" v-model="onlyDuringBusinessHours" />
      </div>

      <div class="flex items-center justify-end w-full gap-2 mt-4">
        <Button variant="outline" type="button" @click.prevent="onClose">
          {{ $t('SLA.FORM.CANCEL') }}
        </Button>
        <Button
          variant="default"
          type="submit"
          :disabled="
            !meta.valid || isSlaTimeInputsInvalid || uiFlags.isUpdating
          "
        >
          <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isUpdating">{{ submitLabel }}</template>
        </Button>
      </div>
    </Form>
  </div>
</template>
