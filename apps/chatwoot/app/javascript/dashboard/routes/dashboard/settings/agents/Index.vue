<script setup>
import { useAlert } from 'dashboard/composables';
import { computed, onMounted, ref } from 'vue';
import Avatar from 'next/avatar/Avatar.vue';
import { useI18n } from 'vue-i18n';
import {
  useStoreGetters,
  useStore,
  useMapGetter,
} from 'dashboard/composables/store';

import AddAgent from './AddAgent.vue';
import EditAgent from './EditAgent.vue';
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
const showDeletePopup = ref(false);
const showEditPopup = ref(false);
const agentAPI = ref({ message: '' });
const currentAgent = ref({});

const deleteConfirmText = computed(
  () => `${t('AGENT_MGMT.DELETE.CONFIRM.YES')} ${currentAgent.value.name}`
);
const deleteRejectText = computed(() => {
  return `${t('AGENT_MGMT.DELETE.CONFIRM.NO')} ${currentAgent.value.name}`;
});
const deleteMessage = computed(() => {
  return ` ${currentAgent.value.name}?`;
});

const agentList = computed(() => getters['agents/getAgents'].value);
const uiFlags = computed(() => getters['agents/getUIFlags'].value);
const currentUserId = computed(() => getters.getCurrentUserID.value);
const customRoles = useMapGetter('customRole/getCustomRoles');

onMounted(() => {
  store.dispatch('agents/get');
  store.dispatch('customRole/getCustomRole');
});

const findCustomRole = agent =>
  customRoles.value.find(role => role.id === agent.custom_role_id);

const getAgentRoleName = agent => {
  if (!agent.custom_role_id) {
    return t(`AGENT_MGMT.AGENT_TYPES.${agent.role.toUpperCase()}`);
  }
  const customRole = findCustomRole(agent);
  return customRole ? customRole.name : '';
};

const getAgentRolePermissions = agent => {
  if (!agent.custom_role_id) {
    return [];
  }
  const customRole = findCustomRole(agent);
  return customRole?.permissions || [];
};

const verifiedAdministrators = computed(() => {
  return agentList.value.filter(
    agent => agent.role === 'administrator' && agent.confirmed
  );
});

const showEditAction = agent => {
  return currentUserId.value !== agent.id;
};

const showDeleteAction = agent => {
  if (currentUserId.value === agent.id) {
    return false;
  }

  if (!agent.confirmed) {
    return true;
  }

  if (agent.role === 'administrator') {
    return verifiedAdministrators.value.length !== 1;
  }
  return true;
};

const showAlertMessage = message => {
  loading.value[currentAgent.value.id] = false;
  currentAgent.value = {};
  agentAPI.value.message = message;
  useAlert(message);
};

const openAddPopup = () => {
  showAddPopup.value = true;
};
const hideAddPopup = () => {
  showAddPopup.value = false;
};

const openEditPopup = agent => {
  showEditPopup.value = true;
  currentAgent.value = agent;
};
const hideEditPopup = () => {
  showEditPopup.value = false;
};

const openDeletePopup = agent => {
  showDeletePopup.value = true;
  currentAgent.value = agent;
};
const closeDeletePopup = () => {
  showDeletePopup.value = false;
};

const deleteAgent = async id => {
  try {
    await store.dispatch('agents/delete', id);
    showAlertMessage(t('AGENT_MGMT.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    showAlertMessage(t('AGENT_MGMT.DELETE.API.ERROR_MESSAGE'));
  }
};
const confirmDeletion = () => {
  loading.value[currentAgent.value.id] = true;
  closeDeletePopup();
  deleteAgent(currentAgent.value.id);
};
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.isFetching"
    :loading-message="$t('AGENT_MGMT.LOADING')"
    :no-records-found="!agentList.length"
    :no-records-message="$t('AGENT_MGMT.LIST.404')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="$t('AGENT_MGMT.HEADER')"
        :description="$t('AGENT_MGMT.DESCRIPTION')"
        :link-text="$t('AGENT_MGMT.LEARN_MORE')"
        feature-name="agents"
      >
        <template #actions>
          <Button @click="openAddPopup">
            <Icon icon="i-lucide-circle-plus" />{{
              $t('AGENT_MGMT.HEADER_BTN_TXT')
            }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <table class="divide-y divide-n-weak">
        <tbody class="divide-y divide-n-weak text-n-slate-11">
          <tr v-for="(agent, index) in agentList" :key="agent.email">
            <td class="py-4 ltr:pr-4 rtl:pl-4">
              <div class="flex flex-row items-center gap-4">
                <Avatar
                  :src="agent.thumbnail"
                  :name="agent.name"
                  :status="agent.availability_status"
                  :size="40"
                  hide-offline-status
                  rounded-full
                />
                <div>
                  <span class="block font-medium capitalize">
                    {{ agent.name }}
                  </span>
                  <span>{{ agent.email }}</span>
                </div>
              </div>
            </td>

            <td class="relative py-4 ltr:pr-4 rtl:pl-4">
              <span
                class="block font-medium w-fit"
                :class="{
                  'hover:text-gray-900 group cursor-pointer':
                    agent.custom_role_id,
                }"
              >
                {{ getAgentRoleName(agent) }}

                <div
                  class="absolute left-0 z-10 hidden max-w-[300px] w-auto bg-white rounded-xl border border-n-weak shadow-lg top-14 md:top-12 dark:bg-n-solid-2"
                  :class="{ 'group-hover:block': agent.custom_role_id }"
                >
                  <div class="flex flex-col gap-1 p-4">
                    <span class="font-semibold">
                      {{ $t('AGENT_MGMT.LIST.AVAILABLE_CUSTOM_ROLE') }}
                    </span>
                    <ul class="pl-4 mb-0 list-disc">
                      <li
                        v-for="permission in getAgentRolePermissions(agent)"
                        :key="permission"
                        class="font-normal"
                      >
                        {{
                          $t(
                            `CUSTOM_ROLE.PERMISSIONS.${permission.toUpperCase()}`
                          )
                        }}
                      </li>
                    </ul>
                  </div>
                </div>
              </span>
            </td>
            <td class="py-4 ltr:pr-4 rtl:pl-4">
              <span v-if="agent.confirmed">
                {{ $t('AGENT_MGMT.LIST.VERIFIED') }}
              </span>
              <span v-if="!agent.confirmed">
                {{ $t('AGENT_MGMT.LIST.VERIFICATION_PENDING') }}
              </span>
            </td>
            <td class="py-4">
              <div class="flex justify-end gap-1">
                <Button
                  v-if="showEditAction(agent)"
                  v-tooltip.top="$t('AGENT_MGMT.EDIT.BUTTON_TEXT')"
                  variant="outline"
                  size="icon"
                  @click="openEditPopup(agent)"
                >
                  <Icon icon="i-lucide-pen" />
                </Button>
                <Button
                  v-if="showDeleteAction(agent)"
                  v-tooltip.top="$t('AGENT_MGMT.DELETE.BUTTON_TEXT')"
                  variant="destructive"
                  size="icon"
                  :disabled="loading[agent.id]"
                  @click="openDeletePopup(agent, index)"
                >
                  <Spinner
                    v-if="loading[agent.id]"
                    class="size-4 flex-shrink-0"
                  /><template v-if="!loading[agent.id]">
                    <Icon icon="i-lucide-trash-2" />
                  </template>
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <AddAgent :open="showAddPopup" @close="hideAddPopup" />

    <EditAgent
      v-if="showEditPopup"
      :id="currentAgent.id"
      :open="showEditPopup"
      :name="currentAgent.name"
      :provider="currentAgent.provider"
      :type="currentAgent.role"
      :email="currentAgent.email"
      :availability="currentAgent.availability_status"
      :custom-role-id="currentAgent.custom_role_id"
      @close="hideEditPopup"
    />

    <AlertDialog
      :open="showDeletePopup"
      @update:open="showDeletePopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('AGENT_MGMT.DELETE.CONFIRM.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('AGENT_MGMT.DELETE.CONFIRM.MESSAGE') }}
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
  </SettingsLayout>
</template>
