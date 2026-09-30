<script setup>
import { useAlert } from 'dashboard/composables';
import AddCanned from './AddCanned.vue';
import EditCanned from './EditCanned.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import { computed, onMounted, ref, defineOptions } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStoreGetters, useStore } from 'dashboard/composables/store';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
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

defineOptions({
  name: 'CannedResponseSettings',
});

const getters = useStoreGetters();
const store = useStore();
const { t } = useI18n();

const { getPlainText } = useMessageFormatter();

const loading = ref({});
const showEditPopup = ref(false);
const showDeleteConfirmationPopup = ref(false);
const activeResponse = ref({});
const cannedResponseAPI = ref({ message: '' });

const sortOrder = ref('asc');
const records = computed(() =>
  getters.getSortedCannedResponses.value(sortOrder.value)
);
const uiFlags = computed(() => getters.getUIFlags.value);

const deleteConfirmText = computed(
  () =>
    `${t('CANNED_MGMT.DELETE.CONFIRM.YES')} ${activeResponse.value.short_code}`
);

const deleteRejectText = computed(
  () =>
    `${t('CANNED_MGMT.DELETE.CONFIRM.NO')} ${activeResponse.value.short_code}`
);

const deleteMessage = computed(() => {
  return ` ${activeResponse.value.short_code} ? `;
});

const toggleSort = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
};

const fetchCannedResponses = async () => {
  try {
    await store.dispatch('getCannedResponse');
  } catch (error) {
    // Ignore Error
  }
};

onMounted(() => {
  fetchCannedResponses();
});

const showAlertMessage = message => {
  loading[activeResponse.value.id] = false;
  activeResponse.value = {};
  cannedResponseAPI.value.message = message;
  useAlert(message);
};

const openEditPopup = response => {
  showEditPopup.value = true;
  activeResponse.value = response;
};
const hideEditPopup = () => {
  showEditPopup.value = false;
};

const openDeletePopup = response => {
  showDeleteConfirmationPopup.value = true;
  activeResponse.value = response;
};

const closeDeletePopup = () => {
  showDeleteConfirmationPopup.value = false;
};

const deleteCannedResponse = async id => {
  try {
    await store.dispatch('deleteCannedResponse', id);
    showAlertMessage(t('CANNED_MGMT.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    const errorMessage =
      error?.message || t('CANNED_MGMT.DELETE.API.ERROR_MESSAGE');
    showAlertMessage(errorMessage);
  }
};

const confirmDeletion = () => {
  loading[activeResponse.value.id] = true;
  closeDeletePopup();
  deleteCannedResponse(activeResponse.value.id);
};

const tableHeaders = computed(() => {
  return [
    t('CANNED_MGMT.LIST.TABLE_HEADER.SHORT_CODE'),
    t('CANNED_MGMT.LIST.TABLE_HEADER.CONTENT'),
    t('CANNED_MGMT.LIST.TABLE_HEADER.ACTIONS'),
  ];
});
</script>

<template>
  <div class="flex-1 overflow-auto">
    <BaseSettingsHeader
      :title="$t('CANNED_MGMT.HEADER')"
      :description="$t('CANNED_MGMT.DESCRIPTION')"
      :link-text="$t('CANNED_MGMT.LEARN_MORE')"
      feature-name="canned_responses"
    >
      <template #actions>
        <AddCanned>
          <template #trigger>
            <Button>
              <Icon icon="i-lucide-circle-plus" />
              {{ $t('CANNED_MGMT.HEADER_BTN_TXT') }}
            </Button>
          </template>
        </AddCanned>
      </template>
    </BaseSettingsHeader>

    <div class="mt-6 flex-1">
      <woot-loading-state
        v-if="uiFlags.fetchingList"
        :message="$t('CANNED_MGMT.LOADING')"
      />
      <p
        v-else-if="!records.length"
        class="flex flex-col items-center justify-center h-full text-base text-n-slate-11 py-8"
      >
        {{ $t('CANNED_MGMT.LIST.404') }}
      </p>
      <table v-else class="min-w-full overflow-x-auto divide-y divide-n-weak">
        <thead>
          <th
            v-for="thHeader in tableHeaders"
            :key="thHeader"
            class="py-4 ltr:pr-4 rtl:pl-4 text-left font-semibold text-n-slate-11 last:text-right"
          >
            <span v-if="thHeader !== tableHeaders[0]">
              {{ thHeader }}
            </span>
            <button
              v-else
              class="flex items-center p-0 cursor-pointer"
              @click="toggleSort"
            >
              <span class="mb-0">
                {{ thHeader }}
              </span>
              <fluent-icon
                class="ml-2 size-4"
                :icon="sortOrder === 'desc' ? 'chevron-up' : 'chevron-down'"
              />
            </button>
          </th>
        </thead>
        <tbody class="divide-y divide-n-weak text-n-slate-11">
          <tr
            v-for="(cannedItem, index) in records"
            :key="cannedItem.short_code"
          >
            <td
              class="py-4 ltr:pr-4 rtl:pl-4 truncate max-w-xs font-medium"
              :title="cannedItem.short_code"
            >
              {{ cannedItem.short_code }}
            </td>
            <td class="py-4 ltr:pr-4 rtl:pl-4 md:break-all whitespace-normal">
              {{ getPlainText(cannedItem.content) }}
            </td>
            <td class="py-4 flex justify-end gap-1">
              <Button
                v-tooltip.top="$t('CANNED_MGMT.EDIT.BUTTON_TEXT')"
                variant="outline"
                size="icon"
                @click="openEditPopup(cannedItem)"
              >
                <Icon icon="i-lucide-pen" />
              </Button>
              <Button
                v-tooltip.top="$t('CANNED_MGMT.DELETE.BUTTON_TEXT')"
                variant="destructive"
                size="icon"
                :disabled="loading[cannedItem.id]"
                @click="openDeletePopup(cannedItem, index)"
              >
                <Spinner
                  v-if="loading[cannedItem.id]"
                  class="size-4 flex-shrink-0"
                />
                <template v-if="!loading[cannedItem.id]">
                  <Icon icon="i-lucide-trash-2" />
                </template>
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EditCanned
      v-if="showEditPopup"
      :id="activeResponse.id"
      :open="showEditPopup"
      :edshort-code="activeResponse.short_code"
      :edcontent="activeResponse.content"
      :on-close="hideEditPopup"
      @close="hideEditPopup"
    />

    <AlertDialog
      :open="showDeleteConfirmationPopup"
      @update:open="showDeleteConfirmationPopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('CANNED_MGMT.DELETE.CONFIRM.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('CANNED_MGMT.DELETE.CONFIRM.MESSAGE') }}
            {{ deleteMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeDeletePopup">
            {{ deleteRejectText }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ deleteConfirmText }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
