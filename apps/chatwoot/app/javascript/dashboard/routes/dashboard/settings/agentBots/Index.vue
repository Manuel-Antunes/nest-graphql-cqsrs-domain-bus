<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';

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
import {
  BaseTable,
  BaseTableRow,
  BaseTableCell,
} from 'dashboard/components-next/table';

const MODAL_TYPES = {
  CREATE: 'create',
  EDIT: 'edit',
};

const store = useStore();
const { t } = useI18n();

const agentBots = useMapGetter('agentBots/getBots');
const uiFlags = useMapGetter('agentBots/getUIFlags');

const selectedBot = ref({});
const searchQuery = ref('');
const loading = ref({});
const modalType = ref(MODAL_TYPES.CREATE);
const agentBotModalRef = ref(null);
const isDeleteOpen = ref(false);

const tableHeaders = computed(() => {
  return [
    t('AGENT_BOTS.LIST.TABLE_HEADER.DETAILS'),
    t('AGENT_BOTS.LIST.TABLE_HEADER.URL'),
    t('AGENT_BOTS.LIST.TABLE_HEADER.ACTIONS'),
  ];
});

const selectedBotName = computed(() => selectedBot.value?.name || '');

const filteredAgentBots = computed(() => {
  const query = searchQuery.value.trim();
  if (!query) return agentBots.value;
  return picoSearch(agentBots.value, query, ['name', 'description']);
});

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
        v-model:search-query="searchQuery"
        :title="t('AGENT_BOTS.HEADER')"
        :description="t('AGENT_BOTS.DESCRIPTION')"
        :link-text="t('AGENT_BOTS.LEARN_MORE')"
        :search-placeholder="t('AGENT_BOTS.SEARCH_PLACEHOLDER')"
        feature-name="agent_bots"
      >
        <template v-if="agentBots?.length" #count>
          <span class="text-body-main text-n-slate-11">
            {{ $t('AGENT_BOTS.COUNT', { n: agentBots.length }) }}
          </span>
        </template>
        <template #actions>
          <Button variant="default" @click="openAddModal">
            <Icon icon="i-lucide-circle-plus" />
            {{ $t('AGENT_BOTS.ADD.TITLE') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <BaseTable
        :headers="tableHeaders"
        :items="filteredAgentBots"
        :no-data-message="
          searchQuery ? t('AGENT_BOTS.NO_RESULTS') : t('AGENT_BOTS.LIST.404')
        "
      >
        <template #row="{ items }">
          <BaseTableRow v-for="bot in items" :key="bot.id" :item="bot">
            <template #default>
              <BaseTableCell class="max-w-0">
                <div class="flex items-center gap-4 min-w-0">
                  <Avatar
                    :name="bot.name || ''"
                    :src="bot.thumbnail"
                    :size="40"
                    class="flex-shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-body-main text-n-slate-12 truncate">
                        {{ bot.name }}
                      </span>
                      <span
                        v-if="bot.system_bot"
                        class="text-xs text-n-slate-12 bg-n-blue-5 rounded-md py-0.5 px-1 flex-shrink-0"
                      >
                        {{ $t('AGENT_BOTS.GLOBAL_BOT_BADGE') }}
                      </span>
                    </div>
                    <span class="text-body-main text-n-slate-11 block truncate">
                      {{ bot.description }}
                    </span>
                  </div>
                </div>
              </BaseTableCell>

              <BaseTableCell class="max-w-0">
                <span class="text-body-main text-n-slate-11 truncate block">
                  {{ bot.outgoing_url || bot.bot_config?.webhook_url }}
                </span>
              </BaseTableCell>

              <BaseTableCell align="end" class="w-24">
                <div class="flex gap-3 justify-end flex-shrink-0">
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
              </BaseTableCell>
            </template>
          </BaseTableRow>
        </template>
      </BaseTable>
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
