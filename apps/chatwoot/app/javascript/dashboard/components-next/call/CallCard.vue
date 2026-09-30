<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VOICE_CALL_DIRECTION } from 'dashboard/components-next/message/constants';
import { VOICE_CALL_PROVIDERS } from 'dashboard/helper/inbox';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Card } from 'dashboard/components-next/ui/card';

const props = defineProps({
  call: {
    type: Object,
    required: true,
  },
  callInfo: {
    type: Object,
    required: true,
  },
  // 'incoming' | 'outgoing' | 'ongoing'
  state: {
    type: String,
    required: true,
  },
  duration: {
    type: String,
    default: '',
  },
  isMuted: {
    type: Boolean,
    default: false,
  },
  showMute: {
    type: Boolean,
    default: false,
  },
});

defineEmits([
  'accept',
  'reject',
  'end',
  'toggleMute',
  'goToConversation',
  'dismiss',
]);

const { t } = useI18n();

const isOngoing = computed(() => props.state === VOICE_CALL_DIRECTION.ONGOING);
const isIncoming = computed(
  () => props.state === VOICE_CALL_DIRECTION.INCOMING
);
const isOutgoing = computed(
  () => props.state === VOICE_CALL_DIRECTION.OUTGOING
);

const statusIcon = computed(() => {
  if (isOngoing.value) return 'i-ph-phone-call-bold';
  if (isOutgoing.value) return 'i-ph-phone-outgoing-bold';
  return 'i-ph-phone-incoming-bold';
});

const statusLabel = computed(() => {
  if (isOngoing.value) return t('CONVERSATION.VOICE_WIDGET.CALL_IN_PROGRESS');
  if (isOutgoing.value) return t('CONVERSATION.VOICE_WIDGET.OUTGOING_CALL');
  return t('CONVERSATION.VOICE_WIDGET.INCOMING_CALL');
});

const channelIcon = computed(() => {
  if (props.call?.provider === VOICE_CALL_PROVIDERS.WHATSAPP)
    return 'i-ri-whatsapp-fill';
  return 'i-ph-phone-bold';
});
</script>

<template>
  <Card
    :data-call-state="state"
    class="gap-1 pt-4 rounded-2xl border-n-call-widget-border bg-n-call-widget text-n-call-widget-text shadow-xl backdrop-blur-md"
    :class="call?.conversationId ? 'pb-2' : 'pb-4'"
  >
    <!-- Top section: status badge + location/inbox + duration -->
    <div class="flex flex-col gap-3 pb-3 border-b border-n-call-widget-border">
      <div class="flex items-center gap-2 px-4">
        <!-- Ongoing: status badge on left -->
        <div v-if="isOngoing" class="flex items-center gap-1.5 shrink-0">
          <Icon :icon="statusIcon" class="size-3.5 text-n-teal-9 shrink-0" />
          <span class="text-xs font-medium text-n-teal-9 tracking-tight">
            {{ statusLabel }}
          </span>
        </div>

        <!-- Caller location (city, country) or fallback to channel + inbox name -->
        <div class="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            v-if="callInfo.hasLocation && callInfo.countryFlag"
            class="text-sm leading-none shrink-0"
          >
            {{ callInfo.countryFlag }}
          </span>
          <Icon
            v-else-if="!isOngoing"
            :icon="channelIcon"
            class="size-3.5 text-n-call-widget-sub-text shrink-0"
          />
          <span
            class="text-xs font-medium text-n-call-widget-sub-text tracking-tight truncate"
          >
            {{ callInfo.location }}
          </span>
        </div>

        <!-- Ongoing: duration on right -->
        <p
          v-if="isOngoing"
          class="font-display text-base font-medium text-n-call-widget-sub-text shrink-0 mb-0 tabular-nums tracking-tight"
          data-test="call-duration"
        >
          {{ duration }}
        </p>
        <!-- Incoming/Outgoing: status badge on right -->
        <div v-else class="flex items-center gap-1.5 shrink-0">
          <Icon :icon="statusIcon" class="size-3.5 text-n-teal-9 shrink-0" />
          <span class="text-xs font-medium text-n-teal-9 tracking-tight">
            {{ statusLabel }}
          </span>
          <!-- Dismiss: removes the notification from the UI without declining.
               Incoming only — outgoing/ongoing calls are ended via the call
               controls, not silently dismissed. -->
          <Button
            v-if="isIncoming"
            v-tooltip.top="$t('CONVERSATION.VOICE_WIDGET.DISMISS_CALL')"
            variant="ghost"
            size="icon-xs"
            class="-my-1 -me-1 rounded-full text-n-call-widget-sub-text hover:bg-n-alpha-2 hover:text-n-call-widget-text"
            data-test="call-dismiss"
            @click="$emit('dismiss')"
          >
            <Icon icon="i-ph-x-bold" class="size-3.5" />
          </Button>
        </div>
      </div>

      <!-- Main row: avatar + name/phone + actions -->
      <div class="flex items-center gap-3 px-4">
        <div class="shrink-0">
          <Avatar
            :src="callInfo.avatar"
            :name="callInfo.contactName"
            :size="40"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p
            class="font-display text-sm font-medium text-n-call-widget-text truncate mb-0.5 tracking-tight leading-tight"
            data-test="call-contact"
          >
            {{ callInfo.contactName }}
          </p>
          <p
            v-if="callInfo.phoneNumber"
            class="text-sm text-n-call-widget-sub-text truncate mb-0 tracking-tight leading-tight"
          >
            {{ callInfo.phoneNumber }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <Button
            v-if="isOngoing && showMute"
            v-tooltip.top="
              isMuted
                ? $t('CONVERSATION.VOICE_WIDGET.UNMUTE')
                : $t('CONVERSATION.VOICE_WIDGET.MUTE')
            "
            size="icon"
            class="rounded-full"
            :class="
              isMuted
                ? 'bg-n-amber-9 text-white hover:bg-n-amber-10'
                : 'bg-n-teal-9/20 text-n-teal-11 hover:bg-n-teal-9/30'
            "
            data-test="call-mute"
            @click="$emit('toggleMute')"
          >
            <Icon
              :icon="
                isMuted ? 'i-ph-microphone-slash-bold' : 'i-ph-microphone-bold'
              "
              class="size-4"
            />
          </Button>

          <!-- Accept call (incoming only) -->
          <Button
            v-if="isIncoming"
            v-tooltip.top="$t('CONVERSATION.VOICE_WIDGET.JOIN_CALL')"
            size="icon"
            class="rounded-full bg-n-teal-9 text-white hover:bg-n-teal-10"
            data-test="call-accept"
            @click="$emit('accept')"
          >
            <Icon icon="i-ph-phone-bold" class="size-4" />
          </Button>

          <!-- Reject / end call (all states) -->
          <Button
            v-tooltip.top="
              isOngoing
                ? $t('CONVERSATION.VOICE_WIDGET.END_CALL')
                : $t('CONVERSATION.VOICE_WIDGET.REJECT_CALL')
            "
            variant="destructive"
            size="icon"
            class="rounded-full bg-n-ruby-9 text-white hover:bg-n-ruby-10"
            :data-test="isOngoing ? 'call-end' : 'call-reject'"
            @click="isOngoing ? $emit('end') : $emit('reject')"
          >
            <Icon icon="i-ph-phone-bold" class="size-4 rotate-[135deg]" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Footer: go to conversation thread -->
    <Button
      v-if="call?.conversationId"
      variant="ghost"
      class="justify-between h-9 px-2 mx-2 text-n-call-widget-sub-text hover:bg-n-alpha-2 hover:text-n-call-widget-text"
      data-test="call-go-to-conversation"
      @click="$emit('goToConversation')"
    >
      <span class="text-sm tracking-tight">
        {{ $t('CONVERSATION.VOICE_WIDGET.GO_TO_CONVERSATION') }}
      </span>
      <span class="flex items-center gap-1">
        <Icon icon="i-ph-chat-circle-text-bold" class="size-3.5 shrink-0" />
        <span class="text-sm tracking-tight tabular-nums">
          #{{ call.conversationId }}
        </span>
        <Icon icon="i-ph-caret-right-bold" class="size-3 shrink-0" />
      </span>
    </Button>
  </Card>
</template>
