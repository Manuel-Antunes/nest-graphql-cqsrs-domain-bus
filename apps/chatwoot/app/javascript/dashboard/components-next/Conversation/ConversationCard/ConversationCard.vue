<script setup>
import { computed, ref } from 'vue';
import { getInboxIconByType } from 'dashboard/helper/inbox';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper.js';
import { shortTimestamp } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import CardMessagePreview from './CardMessagePreview.vue';
import CardMessagePreviewWithMeta from './CardMessagePreviewWithMeta.vue';
import CardPriorityIcon from './CardPriorityIcon.vue';
import Card from 'next/ui/card/Card.vue';
import CardContent from 'next/ui/card/CardContent.vue';

const props = defineProps({
  conversation: {
    type: Object,
    required: true,
  },
  contact: {
    type: Object,
    required: true,
  },
  stateInbox: {
    type: Object,
    required: true,
  },
  accountLabels: {
    type: Array,
    required: true,
  },
});

const exactTimestamp = useExactTimestamp();

const { currentParams, visit } = useAppNavigation();

const cardMessagePreviewWithMetaRef = ref(null);

const currentContact = computed(() => props.contact);

const currentContactName = computed(() => currentContact.value?.name);
const currentContactThumbnail = computed(() => currentContact.value?.thumbnail);
const currentContactStatus = computed(
  () => currentContact.value?.availabilityStatus
);

const inbox = computed(() => props.stateInbox);

const inboxName = computed(() => inbox.value?.name);

const inboxIcon = computed(() => {
  const { channelType, medium, voiceEnabled } = inbox.value;
  return getInboxIconByType(channelType, medium, 'fill', voiceEnabled);
});

const lastActivityAt = computed(() => {
  const timestamp = props.conversation?.timestamp;
  // The timestamp, not a formatted string: `shortTimestamp` reads English
  // words, so it produces its own input rather than taking the localized one.
  return timestamp ? shortTimestamp(timestamp) : '';
});

const hasVisibleLabels = computed(() => {
  const { labels = [] } = props.conversation;
  return props.accountLabels.some(({ title }) => labels.includes(title));
});

const showMessagePreviewWithoutMeta = computed(() => {
  return (
    !cardMessagePreviewWithMetaRef.value?.hasSlaThreshold &&
    !hasVisibleLabels.value
  );
});

const onCardClick = e => {
  const path = frontendURL(
    conversationUrl({
      accountId: currentParams.value.accountId,
      id: props.conversation.id,
    })
  );

  if (e.metaKey || e.ctrlKey) {
    window.open(
      window.chatwootConfig.hostURL + path,
      '_blank',
      'noopener noreferrer nofollow'
    );
    return;
  }
  visit(path);
};
</script>

<template>
  <Card class="cursor-pointer" @click="onCardClick">
    <!-- <div
    role="button"
    class="flex w-full gap-3 px-3 py-4 transition-all duration-300 ease-in-out cursor-pointer"
    @click="onCardClick"
  > -->
    <CardContent>
      <Avatar
        :name="currentContactName"
        :src="currentContactThumbnail"
        :size="24"
        :status="currentContactStatus"
        rounded-full
      />
      <div class="flex flex-col w-full gap-1 min-w-0">
        <div class="flex items-center justify-between h-6 gap-2 min-w-0">
          <h4
            class="flex-1 min-w-0 text-base font-medium truncate text-n-slate-12"
          >
            {{ currentContactName }}
          </h4>
          <div class="flex items-center gap-2 shrink-0">
            <CardPriorityIcon :priority="conversation.priority || null" />
            <div
              v-tooltip.left="inboxName"
              class="flex items-center justify-center flex-shrink-0 rounded-full bg-n-alpha-2 size-5"
            >
              <Icon
                :icon="inboxIcon"
                class="flex-shrink-0 text-n-slate-11 size-3"
              />
            </div>
            <span
              v-tooltip.top="{
                content: exactTimestamp(conversation?.timestamp),
                delay: { show: 500, hide: 0 },
              }"
              class="text-sm text-n-slate-10"
            >
              {{ lastActivityAt }}
            </span>
          </div>
        </div>
        <CardMessagePreview
          v-show="showMessagePreviewWithoutMeta"
          :conversation="conversation"
        />
        <CardMessagePreviewWithMeta
          v-show="!showMessagePreviewWithoutMeta"
          ref="cardMessagePreviewWithMetaRef"
          :conversation="conversation"
          :contact="contact"
          :account-labels="accountLabels"
          :has-labels="hasVisibleLabels"
        />
      </div>
    </CardContent>
  </Card>
  <!-- </div> -->
</template>
