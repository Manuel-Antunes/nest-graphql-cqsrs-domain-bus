<script setup>
import { useI18n } from 'vue-i18n';
import { computed, ref } from 'vue';
import LinkIssue from './LinkIssue.vue';
import CreateIssue from './CreateIssue.vue';
import { Tabs, TabsList, TabsTrigger, TabsContent } from 'next/ui/tabs';

const props = defineProps({
  accountId: {
    type: [Number, String],
    required: true,
  },
  conversation: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['close']);

const { t } = useI18n();

const title = computed(() => {
  const { meta: { sender: { name = null } = {} } = {} } = props.conversation;
  return t('INTEGRATION_SETTINGS.LINEAR.LINK.LINK_TITLE', {
    conversationId: props.conversation.id,
    name,
  });
});

const onClose = () => {
  emit('close');
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted-foreground">
      {{ $t('INTEGRATION_SETTINGS.LINEAR.ADD_OR_LINK.DESCRIPTION') }}
    </p>
    <Tabs default-value="create">
      <TabsList>
        <TabsTrigger value="create">{{ $t('INTEGRATION_SETTINGS.LINEAR.CREATE') }}</TabsTrigger>
        <TabsTrigger value="link">{{ $t('INTEGRATION_SETTINGS.LINEAR.LINK.TITLE') }}</TabsTrigger>
      </TabsList>
      <TabsContent value="create" class="pt-4">
        <CreateIssue
          :account-id="accountId"
          :conversation-id="conversation.id"
          :title="title"
          @close="onClose"
        />
      </TabsContent>
      <TabsContent value="link" class="pt-4">
        <LinkIssue
          :conversation-id="conversation.id"
          :title="title"
          @close="onClose"
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
