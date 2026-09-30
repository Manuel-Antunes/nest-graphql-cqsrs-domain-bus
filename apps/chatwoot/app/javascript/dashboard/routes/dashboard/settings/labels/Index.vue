<script setup>
import { useAlert } from 'dashboard/composables';
import { computed, onBeforeMount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStoreGetters, useStore } from 'dashboard/composables/store';

import AddLabel from './AddLabel.vue';
import EditLabel from './EditLabel.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import SettingsLayout from '../SettingsLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';

const getters = useStoreGetters();
const store = useStore();
const { t } = useI18n();

const loading = ref({});
const showAddPopup = ref(false);
const showEditPopup = ref(false);
const showDeleteConfirmationPopup = ref(false);
const selectedLabel = ref({});

const records = computed(() => getters['labels/getLabels'].value);
const uiFlags = computed(() => getters['labels/getUIFlags'].value);

const deleteMessage = computed(() => ` ${selectedLabel.value.title}?`);

const openAddPopup = () => {
  showAddPopup.value = true;
};
const hideAddPopup = () => {
  showAddPopup.value = false;
};

const openEditPopup = response => {
  showEditPopup.value = true;
  selectedLabel.value = response;
};
const hideEditPopup = () => {
  showEditPopup.value = false;
};

const openDeletePopup = response => {
  showDeleteConfirmationPopup.value = true;
  selectedLabel.value = response;
};
const closeDeletePopup = () => {
  showDeleteConfirmationPopup.value = false;
};

const deleteLabel = async id => {
  try {
    await store.dispatch('labels/delete', id);
    useAlert(t('LABEL_MGMT.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    const errorMessage =
      error?.message || t('LABEL_MGMT.DELETE.API.ERROR_MESSAGE');
    useAlert(errorMessage);
  } finally {
    loading.value[selectedLabel.value.id] = false;
  }
};

const confirmDeletion = () => {
  loading.value[selectedLabel.value.id] = true;
  closeDeletePopup();
  deleteLabel(selectedLabel.value.id);
};

const tableHeaders = computed(() => {
  return [
    t('LABEL_MGMT.LIST.TABLE_HEADER.NAME'),
    t('LABEL_MGMT.LIST.TABLE_HEADER.DESCRIPTION'),
    t('LABEL_MGMT.LIST.TABLE_HEADER.COLOR'),
  ];
});

onBeforeMount(() => {
  store.dispatch('labels/get');
});
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.isFetching"
    :loading-message="$t('LABEL_MGMT.LOADING')"
    :no-records-found="!records.length"
    :no-records-message="$t('LABEL_MGMT.LIST.404')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="$t('LABEL_MGMT.HEADER')"
        :description="$t('LABEL_MGMT.DESCRIPTION')"
        :link-text="$t('LABEL_MGMT.LEARN_MORE')"
        feature-name="labels"
      >
        <template #actions>
          <Button @click="openAddPopup">
            <Icon icon="i-lucide-circle-plus" />
            {{ $t('LABEL_MGMT.HEADER_BTN_TXT') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <table class="min-w-full overflow-x-auto divide-y divide-n-weak">
        <thead>
          <th
            v-for="thHeader in tableHeaders"
            :key="thHeader"
            class="py-4 font-semibold text-left ltr:pr-4 rtl:pl-4 text-n-slate-11"
          >
            {{ thHeader }}
          </th>
        </thead>
        <tbody class="flex-1 divide-y divide-n-weak text-n-slate-12">
          <tr v-for="(label, index) in records" :key="label.title">
            <td class="py-4 ltr:pr-4 rtl:pl-4">
              <span class="mb-1 font-medium break-words text-n-slate-12">
                {{ label.title }}
              </span>
            </td>
            <td class="py-4 ltr:pr-4 rtl:pl-4">{{ label.description }}</td>
            <td class="py-4 leading-6 ltr:pr-4 rtl:pl-4">
              <div class="flex items-center">
                <span
                  class="w-4 h-4 mr-1 border border-solid rounded rtl:mr-0 rtl:ml-1 border-n-weak"
                  :style="{ backgroundColor: label.color }"
                />
                {{ label.color }}
              </div>
            </td>
            <td class="py-4 min-w-xs">
              <div class="flex gap-1 justify-end">
                <Button
                  v-tooltip.top="$t('LABEL_MGMT.FORM.EDIT')"
                  variant="outline"
                  size="icon"
                  :disabled="loading[label.id]"
                  @click="openEditPopup(label)"
                >
                  <Spinner
                    v-if="loading[label.id]"
                    class="size-4 flex-shrink-0"
                  />
                  <template v-if="!loading[label.id]">
                    <Icon icon="i-lucide-pen" />
                  </template>
                </Button>
                <Button
                  v-tooltip.top="$t('LABEL_MGMT.FORM.DELETE')"
                  variant="destructive"
                  size="icon"
                  :disabled="loading[label.id]"
                  @click="openDeletePopup(label, index)"
                >
                  <Spinner
                    v-if="loading[label.id]"
                    class="size-4 flex-shrink-0"
                  />
                  <template v-if="!loading[label.id]">
                    <Icon icon="i-lucide-trash-2" />
                  </template>
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <AddLabel :open="showAddPopup" @close="hideAddPopup" />

    <EditLabel
      :open="showEditPopup"
      :selected-response="selectedLabel"
      @close="hideEditPopup"
    />

    <AlertDialog
      :open="showDeleteConfirmationPopup"
      @update:open="showDeleteConfirmationPopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('LABEL_MGMT.DELETE.CONFIRM.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('LABEL_MGMT.DELETE.CONFIRM.MESSAGE') }}
            {{ deleteMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeDeletePopup">
            {{ $t('LABEL_MGMT.DELETE.CONFIRM.NO') }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ $t('LABEL_MGMT.DELETE.CONFIRM.YES') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SettingsLayout>
</template>
