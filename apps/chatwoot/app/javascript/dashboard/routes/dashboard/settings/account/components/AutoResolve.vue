<script setup>
import { h, ref, watch, computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAlert } from 'dashboard/composables';
import SectionLayout from './SectionLayout.vue';
import WithLabel from 'v3/components/Form/WithLabel.vue';
import { Textarea } from 'dashboard/components-next/ui/textarea';
import { Switch } from 'dashboard/components-next/ui/switch';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import DurationInput from 'next/input/DurationInput.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { DURATION_UNITS } from 'dashboard/components-next/input/constants';

const { t } = useI18n();
const duration = ref(0);
const unit = ref(DURATION_UNITS.MINUTES);
const message = ref('');
const labelToApply = ref({});
const ignoreWaiting = ref(false);
const isEnabled = ref(false);
const isSubmitting = ref(false);

const { currentAccount, updateAccount } = useAccount();

const labels = useMapGetter('labels/getLabels');

const labelOptions = computed(() =>
  labels.value?.length
    ? labels.value.map(label => ({
        id: label.title,
        name: label.title,
        icon: h('span', {
          class: `size-[12px] ring-1 ring-n-alpha-1 dark:ring-white/20 ring-inset rounded-sm`,
          style: { backgroundColor: label.color },
        }),
      }))
    : []
);

const selectedLabelName = computed(() => {
  return labelToApply.value?.name ?? null;
});

watch(
  [currentAccount, labelOptions],
  () => {
    const {
      auto_resolve_after,
      auto_resolve_message,
      auto_resolve_ignore_waiting,
      auto_resolve_label,
    } = currentAccount.value?.settings || {};

    duration.value = auto_resolve_after;
    message.value = auto_resolve_message;
    ignoreWaiting.value = auto_resolve_ignore_waiting;
    // find the correct label option from the list
    // the single select component expects the full label object
    // in our case, the label id and name are both the same
    labelToApply.value = labelOptions.value.find(
      option => option.name === auto_resolve_label
    );

    // Set unit based on duration and its divisibility
    if (duration.value) {
      if (duration.value % (24 * 60) === 0) {
        unit.value = DURATION_UNITS.DAYS;
      } else if (duration.value % 60 === 0) {
        unit.value = DURATION_UNITS.HOURS;
      } else {
        unit.value = DURATION_UNITS.MINUTES;
      }
    }

    if (duration.value) {
      isEnabled.value = true;
    }
  },
  { deep: true, immediate: true }
);

const updateAccountSettings = async settings => {
  try {
    isSubmitting.value = true;
    await updateAccount(settings, { silent: true });
    useAlert(t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.DURATION.API.SUCCESS'));
  } catch (error) {
    useAlert(t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.DURATION.API.ERROR'));
  } finally {
    isSubmitting.value = false;
  }
};

const handleSubmit = async () => {
  if (duration.value < 10) {
    useAlert(t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.DURATION.ERROR'));
    return Promise.resolve();
  }

  return updateAccountSettings({
    auto_resolve_after: duration.value,
    auto_resolve_message: message.value,
    auto_resolve_ignore_waiting: ignoreWaiting.value,
    auto_resolve_label: selectedLabelName.value,
  });
};

const handleDisable = async () => {
  duration.value = null;
  message.value = '';

  return updateAccountSettings({
    auto_resolve_after: null,
    auto_resolve_message: '',
    auto_resolve_ignore_waiting: false,
    auto_resolve_label: null,
  });
};

const toggleAutoResolve = async () => {
  if (!isEnabled.value) handleDisable();
};
</script>

<template>
  <SectionLayout
    :title="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.TITLE')"
    :description="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.NOTE')"
    :hide-content="!isEnabled"
    with-border
  >
    <template #headerActions>
      <div class="flex justify-end">
        <Switch v-model="isEnabled" @update:model-value="toggleAutoResolve" />
      </div>
    </template>

    <form class="grid gap-5" @submit.prevent="handleSubmit">
      <WithLabel
        :label="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.DURATION.LABEL')"
        :help-message="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.DURATION.HELP')"
      >
        <div class="w-full">
          <!-- allow 10 mins to 999 days -->
          <DurationInput
            v-model="duration"
            v-model:unit="unit"
            min="0"
            max="1438560"
          />
        </div>
      </WithLabel>
      <WithLabel
        :label="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.MESSAGE.LABEL')"
        :help-message="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.MESSAGE.HELP')"
      >
        <Textarea
          v-model="message"
          class="w-full max-h-20 mb-0"
          :placeholder="
            t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.MESSAGE.PLACEHOLDER')
          "
        />
      </WithLabel>
      <WithLabel :label="t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.PREFERENCES')">
        <div
          class="rounded-xl border border-n-weak bg-n-solid-1 w-full text-sm text-n-slate-12 divide-y divide-n-weak"
        >
          <div class="p-3 h-12 flex items-center justify-between">
            <span>
              {{ t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.IGNORE_WAITING.LABEL') }}
            </span>
            <Switch v-model="ignoreWaiting" />
          </div>
          <div class="p-3 h-12 flex items-center justify-between">
            <span>
              {{ t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.LABEL.LABEL') }}
            </span>
            <Select
              :model-value="
                labelToApply?.id != null ? String(labelToApply.id) : ''
              "
              @update:model-value="
                v =>
                  (labelToApply =
                    labelOptions.find(o => String(o.id) === v) ?? {})
              "
            >
              <SelectTrigger>
                <SelectValue
                  :placeholder="
                    $t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.LABEL.PLACEHOLDER')
                  "
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in labelOptions"
                  :key="String(option.id)"
                  :value="String(option.id)"
                  >{{ option.name }}</SelectItem
                >
              </SelectContent>
            </Select>
          </div>
        </div>
      </WithLabel>
      <div class="flex gap-2">
        <Button variant="default" type="submit" :disabled="isSubmitting">
          <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
          <template v-if="!isSubmitting">{{
            t('GENERAL_SETTINGS.FORM.AUTO_RESOLVE.UPDATE_BUTTON')
          }}</template>
        </Button>
      </div>
    </form>
  </SectionLayout>
</template>
