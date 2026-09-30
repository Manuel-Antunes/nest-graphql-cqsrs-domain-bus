<script setup>
import { useAlert } from 'dashboard/composables';
import MacrosTableRow from './MacrosTableRow.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import SettingsLayout from '../SettingsLayout.vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStoreGetters, useStore } from 'dashboard/composables/store';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
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

const showDeleteConfirmationPopup = ref(false);
const selectedMacro = ref({});

const records = computed(() => getters['macros/getMacros'].value);
const uiFlags = computed(() => getters['macros/getUIFlags'].value);

const deleteMessage = computed(() => ` ${selectedMacro.value.name}?`);

onMounted(() => {
  store.dispatch('macros/get');
});

const deleteMacro = async id => {
  try {
    await store.dispatch('macros/delete', id);
    useAlert(t('MACROS.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('MACROS.DELETE.API.ERROR_MESSAGE'));
  }
};

const openDeletePopup = response => {
  showDeleteConfirmationPopup.value = true;
  selectedMacro.value = response;
};

const closeDeletePopup = () => {
  showDeleteConfirmationPopup.value = false;
};

const confirmDeletion = () => {
  closeDeletePopup();
  deleteMacro(selectedMacro.value.id);
};

const tableHeaders = computed(() => {
  return [
    t('MACROS.LIST.TABLE_HEADER.NAME'),
    t('MACROS.LIST.TABLE_HEADER.CREATED BY'),
    t('MACROS.LIST.TABLE_HEADER.LAST_UPDATED_BY'),
    t('MACROS.LIST.TABLE_HEADER.VISIBILITY'),
  ];
});
</script>

<template>
  <SettingsLayout
    :no-records-message="$t('MACROS.LIST.404')"
    :no-records-found="!records.length"
    :is-loading="uiFlags.isFetching"
    :loading-message="$t('MACROS.LOADING')"
    feature-name="macros"
  >
    <template #header>
      <BaseSettingsHeader
        :title="$t('MACROS.HEADER')"
        :description="$t('MACROS.DESCRIPTION')"
        :link-text="$t('MACROS.LEARN_MORE')"
        feature-name="macros"
      >
        <template #actions>
          <AppLink :to="{ name: 'macros_new' }">
            <Button>
              <Icon icon="i-lucide-circle-plus" />
              {{ $t('MACROS.HEADER_BTN_TXT') }}
            </Button>
          </AppLink>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <table class="min-w-full divide-y divide-n-weak">
        <thead>
          <th
            v-for="thHeader in tableHeaders"
            :key="thHeader"
            class="py-4 ltr:pr-4 rtl:pl-4 text-left font-semibold text-n-slate-11"
          >
            {{ thHeader }}
          </th>
        </thead>
        <tbody class="divide-y divide-n-weak text-n-slate-11">
          <MacrosTableRow
            v-for="(macro, index) in records"
            :key="index"
            :macro="macro"
            @delete="openDeletePopup(macro)"
          />
        </tbody>
      </table>
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
              {{ $t('MACROS.DELETE.CONFIRM.MESSAGE') }}
              {{ deleteMessage }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="closeDeletePopup">
              {{ $t('MACROS.DELETE.CONFIRM.NO') }}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" @click="confirmDeletion">
              {{ $t('MACROS.DELETE.CONFIRM.YES') }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </SettingsLayout>
</template>
