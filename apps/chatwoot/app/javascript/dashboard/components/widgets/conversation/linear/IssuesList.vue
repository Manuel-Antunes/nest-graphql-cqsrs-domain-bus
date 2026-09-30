<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useAlert, useTrack } from 'dashboard/composables';
import { useStoreGetters } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import LinearAPI from 'dashboard/api/integrations/linear';
import CreateOrLinkIssue from './CreateOrLinkIssue.vue';
import LinearIssueItem from './LinearIssueItem.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { LINEAR_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { parseLinearAPIErrorResponse } from 'dashboard/store/utils/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from 'next/ui/dialog';

const props = defineProps({
  conversationId: {
    type: [Number, String],
    required: true,
  },
});

const { t } = useI18n();
const getters = useStoreGetters();

const linkedIssues = ref([]);
const isLoading = ref(false);
const shouldShowCreateModal = ref(false);

const currentAccountId = getters.getCurrentAccountId;

const conversation = computed(
  () => getters.getConversationById.value(props.conversationId) || {}
);

const hasIssues = computed(() => linkedIssues.value.length > 0);

const loadLinkedIssues = async () => {
  isLoading.value = true;
  linkedIssues.value = [];
  try {
    const response = await LinearAPI.getLinkedIssue(props.conversationId);
    linkedIssues.value = response.data || [];
  } catch (error) {
    // Silent fail - not critical for UX
  } finally {
    isLoading.value = false;
  }
};

const unlinkIssue = async (linkId, issueIdentifier) => {
  try {
    await LinearAPI.unlinkIssue(linkId, issueIdentifier, props.conversationId);
    useTrack(LINEAR_EVENTS.UNLINK_ISSUE);
    linkedIssues.value = linkedIssues.value.filter(
      issue => issue.id !== linkId
    );
    useAlert(t('INTEGRATION_SETTINGS.LINEAR.UNLINK.SUCCESS'));
  } catch (error) {
    const errorMessage = parseLinearAPIErrorResponse(
      error,
      t('INTEGRATION_SETTINGS.LINEAR.UNLINK.ERROR')
    );
    useAlert(errorMessage);
  }
};

const openCreateModal = () => {
  shouldShowCreateModal.value = true;
};

const closeCreateModal = () => {
  shouldShowCreateModal.value = false;
  loadLinkedIssues();
};

watch(
  () => props.conversationId,
  () => {
    loadLinkedIssues();
  }
);

onMounted(() => {
  loadLinkedIssues();
});
</script>

<template>
  <div>
    <div class="px-4 pt-3 pb-2">
      <Button variant="ghost" @click="openCreateModal">
        <Icon icon="i-lucide-plus" />
        {{ $t('INTEGRATION_SETTINGS.LINEAR.ADD_OR_LINK_BUTTON') }}
      </Button>
    </div>

    <div v-if="isLoading" class="flex justify-center p-8">
      <Spinner class="size-6" />
    </div>

    <div v-else-if="!hasIssues" class="flex justify-center p-4">
      <p class="text-sm text-n-slate-11">
        {{ $t('INTEGRATION_SETTINGS.LINEAR.NO_LINKED_ISSUES') }}
      </p>
    </div>

    <div v-else class="max-h-[300px] overflow-y-auto">
      <LinearIssueItem
        v-for="linkedIssue in linkedIssues"
        :key="linkedIssue.id"
        class="px-4 pt-3 pb-4 border-b border-n-weak last:border-b-0"
        :linked-issue="linkedIssue"
        @unlink-issue="unlinkIssue"
      />
    </div>

    <Dialog
      :open="shouldShowCreateModal"
      @update:open="
        val => {
          if (!val) closeCreateModal();
        }
      "
    >
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{
            $t('INTEGRATION_SETTINGS.LINEAR.ADD_OR_LINK.TITLE')
          }}</DialogTitle>
        </DialogHeader>
        <CreateOrLinkIssue
          :conversation="conversation"
          :account-id="currentAccountId"
          @close="closeCreateModal"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
