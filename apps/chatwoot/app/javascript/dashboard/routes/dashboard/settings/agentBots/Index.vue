<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';

import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import AgentBotModal from './components/AgentBotModal.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';

const MODAL_TYPES = {
  CREATE: 'create',
  EDIT: 'edit',
};

const store = useStore();
const { t } = useI18n();

const agentBots = useMapGetter('agentBots/getBots');
const uiFlags = useMapGetter('agentBots/getUIFlags');

const selectedBot = ref({});
const loading = ref({});
const modalType = ref(MODAL_TYPES.CREATE);
const agentBotModalRef = ref(null);
const isDeleteOpen = ref(false);

const tableHeaders = computed(() => {
  return [
    t('AGENT_BOTS.LIST.TABLE_HEADER.DETAILS'),
    t('AGENT_BOTS.LIST.TABLE_HEADER.URL'),
  ];
});

const selectedBotName = computed(() => selectedBot.value?.name || '');

const openAddModal = () => {
  modalType.value = MODAL_TYPES.CREATE;
  selectedBot.value = {};
  agentBotModalRef.value.dialogRef.open();
};

const openEditModal = bot => {
  modalType.value = MODAL_TYPES.EDIT;
  selectedBot.value = bot;
  agentBotModalRef.value.dialogRef.open();
};

const openDeletePopup = bot => {
  selectedBot.value = bot;
  isDeleteOpen.value = true;
};

const deleteAgentBot = async id => {
  try {
    await store.dispatch('agentBots/delete', id);
    useAlert(t('AGENT_BOTS.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('AGENT_BOTS.DELETE.API.ERROR_MESSAGE'));
  } finally {
    loading.value[id] = false;
    selectedBot.value = {};
  }
};

const confirmDeletion = () => {
  loading.value[selectedBot.value.id] = true;
  deleteAgentBot(selectedBot.value.id);
  isDeleteOpen.value = false;
};

onMounted(() => {
  store.dispatch('agentBots/get');
});
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.isFetching"
    :loading-message="t('AGENT_BOTS.LIST.LOADING')"
    :no-records-found="!agentBots.length"
    :no-records-message="t('AGENT_BOTS.LIST.404')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="t('AGENT_BOTS.HEADER')"
        :description="t('AGENT_BOTS.DESCRIPTION')"
        :link-text="t('AGENT_BOTS.LEARN_MORE')"
        feature-name="agent_bots"
      >
        <template #actions>
          <Button variant="default" @click="openAddModal">
            <Icon icon="i-lucide-circle-plus" />
            {{ $t('AGENT_BOTS.ADD.TITLE') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <table class="min-w-full overflow-x-auto divide-y divide-n-strong">
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
          <tr v-for="bot in agentBots" :key="bot.id">
            <td class="py-4 ltr:pr-4 rtl:pl-4">
              <div class="flex flex-row items-center gap-4">
                <Avatar
                  :name="bot.name"
                  :src="bot.thumbnail"
                  :size="40"
                  rounded-full
                />
                <div>
                  <span class="block font-medium break-words">
                    {{ bot.name }}
                    <span
                      v-if="bot.system_bot"
                      class="text-xs text-n-slate-12 bg-n-blue-5 inline-block rounded-md py-0.5 px-1 ltr:ml-1 rtl:mr-1"
                    >
                      {{ $t('AGENT_BOTS.GLOBAL_BOT_BADGE') }}
                    </span>
                  </span>
                  <span class="text-sm text-n-slate-11">
                    {{ bot.description }}
                  </span>
                </div>
              </div>
            </td>
            <td class="py-4 ltr:pr-4 rtl:pl-4 text-sm">
              {{ bot.outgoing_url || bot.bot_config?.webhook_url }}
            </td>
            <td class="py-4 min-w-xs">
              <div class="flex gap-1 justify-end">
                <Button
                  v-if="!bot.system_bot"
                  v-tooltip.top="t('AGENT_BOTS.EDIT.BUTTON_TEXT')"
                  variant="outline"
                  size="icon"
                  :disabled="loading[bot.id]"
                  @click="openEditModal(bot)"
                >
                  <Spinner
                    v-if="loading[bot.id]"
                    class="size-4 flex-shrink-0"
                  />
                  <template v-if="!loading[bot.id]">
                    <Icon icon="i-lucide-pen" />
                  </template>
                </Button>
                <Button
                  v-if="!bot.system_bot"
                  v-tooltip.top="t('AGENT_BOTS.DELETE.BUTTON_TEXT')"
                  variant="destructive"
                  size="icon"
                  :disabled="loading[bot.id]"
                  @click="openDeletePopup(bot)"
                >
                  <Spinner
                    v-if="loading[bot.id]"
                    class="size-4 flex-shrink-0"
                  />
                  <template v-if="!loading[bot.id]">
                    <Icon icon="i-lucide-trash-2" />
                  </template>
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <AgentBotModal
      ref="agentBotModalRef"
      :type="modalType"
      :selected-bot="selectedBot"
    />

    <Dialog
      :open="isDeleteOpen"
      @update:open="
        val => {
          if (!val) isDeleteOpen.value = false;
        }
      "
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('AGENT_BOTS.DELETE.CONFIRM.TITLE') }}</DialogTitle>
          <DialogDescription>
            {{
              t('AGENT_BOTS.DELETE.CONFIRM.MESSAGE', { name: selectedBotName })
            }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="flex items-center justify-between gap-3">
          <DialogClose as-child>
            <Button variant="outline" class="w-full">
              {{ $t('DIALOG.BUTTONS.CANCEL') }}
            </Button>
          </DialogClose>
          <Button
            variant="default"
            class="w-full"
            :disabled="uiFlags.isDeleting"
            @click="confirmDeletion"
          >
            <Spinner v-if="uiFlags.isDeleting" class="size-4 flex-shrink-0" />
            {{ t('AGENT_BOTS.DELETE.CONFIRM.YES') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingsLayout>
</template>
