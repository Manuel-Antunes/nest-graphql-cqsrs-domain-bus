<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { relativeDayTimestamp } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';
import { getInboxVoiceIcon } from 'dashboard/helper/inbox';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';
import { useMapGetter } from 'dashboard/composables/store';
import {
  VOICE_CALL_DIRECTION,
  VOICE_CALL_STATUS,
} from 'dashboard/components-next/message/constants';
import AppLink from 'dashboard/components-next/AppLink.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Badge } from 'dashboard/components-next/ui/badge';
import { Button } from 'dashboard/components-next/ui/button';
import { TableCell, TableRow } from 'dashboard/components-next/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';
import CallStatusBadge from './CallStatusBadge.vue';
import CallRecordingPlayer from './CallRecordingPlayer.vue';
import { CALL_KIND, getCallKind } from './constants';

const props = defineProps({
  call: {
    type: Object,
    required: true,
  },
});

const exactTimestamp = useExactTimestamp();

const { t } = useI18n();
const accountId = useMapGetter('getCurrentAccountId');

const kind = computed(() => getCallKind(props.call));

const contactName = computed(() => {
  if (!props.call.contact) return t('CALLS_PAGE.ROW.DELETED_CONTACT');
  return (
    props.call.contact.name ||
    props.call.contact.phoneNumber ||
    ''
  ).replace(/^\+/, '');
});

const agentActionLabel = computed(() => {
  if (!props.call.agent) return '';
  if (kind.value === CALL_KIND.OUTGOING) return t('CALLS_PAGE.ROW.DIALED_BY');
  if (kind.value === CALL_KIND.INCOMING) return t('CALLS_PAGE.ROW.PICKED_BY');
  // Ongoing collapses direction, so resolve dialed-vs-picked from the raw value.
  if (kind.value === CALL_KIND.ONGOING) {
    return props.call.direction === VOICE_CALL_DIRECTION.OUTBOUND
      ? t('CALLS_PAGE.ROW.DIALED_BY')
      : t('CALLS_PAGE.ROW.PICKED_BY');
  }
  return '';
});

const resultLabel = computed(() => {
  if (kind.value === CALL_KIND.MISSED) return t('CALLS_PAGE.ROW.NO_AGENT');
  if (kind.value === CALL_KIND.NO_REPLY) {
    return t('CALLS_PAGE.ROW.NO_CONTACT_ANSWER');
  }
  if (kind.value === CALL_KIND.FAILED) return t('CALLS_PAGE.ROW.FAILED');
  if (kind.value === CALL_KIND.ONGOING) {
    return props.call.status === VOICE_CALL_STATUS.RINGING
      ? t('CALLS_PAGE.ROW.RINGING')
      : t('CALLS_PAGE.ROW.IN_PROGRESS');
  }
  return t('CALLS_PAGE.ROW.ANSWERED');
});

const providerIcon = computed(() =>
  getInboxVoiceIcon(props.call.inbox?.channelType, props.call.inbox?.medium)
);

const createdAtLabel = computed(() =>
  relativeDayTimestamp(props.call.createdAt, t('CALLS_PAGE.ROW.YESTERDAY'))
);

const createdAtTooltip = computed(() => exactTimestamp(props.call.createdAt));

const conversationPath = computed(() => {
  const displayId = props.call.conversation?.displayId;
  if (!displayId || !accountId.value) return '';
  return frontendURL(
    conversationUrl({ accountId: accountId.value, id: displayId }),
    props.call.messageId ? { messageId: props.call.messageId } : undefined
  );
});
</script>

<template>
  <TableRow :data-call-id="call.id" class="border-n-weak hover:bg-n-alpha-1">
    <TableCell class="py-3 ltr:pl-0 rtl:pr-0 max-w-52">
      <div class="flex items-center gap-2.5 min-w-0">
        <Avatar
          :src="call.contact?.avatar"
          :name="contactName"
          :size="24"
          rounded-full
        />
        <span
          v-tooltip.top="{
            content: contactName,
            delay: { show: 500, hide: 0 },
          }"
          class="text-heading-3 font-medium truncate text-n-slate-12"
          data-test="call-contact"
        >
          {{ contactName }}
        </span>
      </div>
    </TableCell>
    <TableCell class="py-3">
      <div class="flex items-center gap-2 min-w-0">
        <CallStatusBadge :kind="kind" />
        <div
          v-if="agentActionLabel"
          class="flex items-center gap-1.5 min-w-0"
          data-test="call-agent"
        >
          <span class="text-label-small text-n-slate-10 shrink-0">
            {{ agentActionLabel }}
          </span>
          <Avatar
            :src="call.agent.avatar"
            :name="call.agent.name"
            :size="20"
            rounded-full
          />
          <span class="text-body-main truncate text-n-slate-12 min-w-0">
            {{ call.agent.name }}
          </span>
        </div>
        <span
          v-else-if="resultLabel"
          class="text-body-main truncate text-n-slate-10 min-w-0"
          data-test="call-result"
        >
          {{ resultLabel }}
        </span>
      </div>
    </TableCell>
    <TableCell class="py-3 w-64">
      <div v-if="call.recordingUrl" class="flex items-center gap-1 min-w-0">
        <CallRecordingPlayer
          :src="call.recordingUrl"
          :fallback-duration="call.durationSeconds || 0"
          class="flex-1 min-w-0"
        />
        <Popover v-if="call.transcript">
          <PopoverTrigger as-child>
            <Button
              v-tooltip.top="t('CALLS_PAGE.ROW.TRANSCRIPT')"
              variant="ghost"
              size="icon-xs"
              class="shrink-0"
              data-test="call-transcript"
            >
              <Icon icon="i-lucide-file-text" class="size-4 text-n-slate-11" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-96 max-w-[90vw]">
            <p class="mb-2 text-heading-3 text-n-slate-12">
              {{ t('CALLS_PAGE.ROW.TRANSCRIPT') }}
            </p>
            <p
              class="max-h-72 overflow-y-auto whitespace-pre-line break-words text-body-main text-n-slate-11"
            >
              {{ call.transcript }}
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </TableCell>
    <TableCell class="hidden py-3 md:table-cell max-w-40">
      <div
        v-tooltip.top="{
          content: call.inbox?.name,
          delay: { show: 500, hide: 0 },
        }"
        class="flex items-center gap-1 min-w-0"
      >
        <Icon :icon="providerIcon" class="size-4 text-n-slate-11 shrink-0" />
        <span class="text-body-main truncate text-n-slate-11 min-w-0">
          {{ call.inbox?.name }}
        </span>
      </div>
    </TableCell>
    <TableCell class="py-3">
      <AppLink
        v-if="conversationPath"
        :to="conversationPath"
        class="inline-flex"
        data-test="call-conversation"
      >
        <Badge
          variant="outline"
          class="gap-1 h-6 rounded-md border-n-weak text-n-slate-11 hover:bg-n-alpha-1"
        >
          <Icon icon="i-lucide-message-circle" class="size-3.5" />
          {{ call.conversation.displayId }}
          <Icon icon="i-lucide-arrow-up-right" class="size-3.5" />
        </Badge>
      </AppLink>
    </TableCell>
    <TableCell class="py-3 ltr:pr-0 rtl:pl-0 text-end">
      <span
        v-tooltip.top="{
          content: createdAtTooltip,
          delay: { show: 500, hide: 0 },
        }"
        class="text-label-small text-n-slate-11 tabular-nums whitespace-nowrap"
      >
        {{ createdAtLabel }}
      </span>
    </TableCell>
  </TableRow>
</template>
