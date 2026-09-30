<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getInboxIconByType } from 'dashboard/helper/inbox';
import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';
import {
  snoozedReopenTimeToTimestamp,
  shortenSnoozeTime,
} from 'dashboard/helper/snoozeHelpers';
import { NOTIFICATION_TYPES_MAPPING } from 'dashboard/routes/dashboard/inbox/helpers/InboxViewHelpers';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import CardPriorityIcon from 'dashboard/components-next/Conversation/ConversationCard/CardPriorityIcon.vue';
import SLACardLabel from 'dashboard/components-next/Conversation/ConversationCard/SLACardLabel.vue';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from 'dashboard/components-next/ui/context-menu';

const props = defineProps({
  inboxItem: { type: Object, default: () => ({}) },
  stateInbox: { type: Object, default: () => ({}) },
});

const emit = defineEmits([
  'click',
  'contextMenuOpen',
  'contextMenuClose',
  'markNotificationAsRead',
  'markNotificationAsUnRead',
  'deleteNotification',
]);

const { t } = useI18n();

const slaCardLabel = ref(null);

const getMessageClasses = {
  emphasis: 'text-sm font-medium text-n-slate-11',
  emphasisUnread: 'text-sm font-medium text-n-slate-12',
  normal: 'text-sm font-normal text-n-slate-11',
  normalUnread: 'text-sm text-n-slate-12',
};

const primaryActor = computed(() => props.inboxItem?.primaryActor);
const meta = computed(() => primaryActor.value?.meta);
const assigneeMeta = computed(() => meta.value?.sender);
const isUnread = computed(() => !props.inboxItem?.readAt);
const inbox = computed(() => props.stateInbox);

const inboxIcon = computed(() => {
  const { channelType, medium } = inbox.value;
  return getInboxIconByType(channelType, medium);
});

const hasSlaThreshold = computed(() => {
  return slaCardLabel.value?.hasSlaThreshold && primaryActor.value?.slaPolicyId;
});

const lastActivityAt = computed(() => {
  const timestamp = props.inboxItem?.lastActivityAt;
  return timestamp ? shortTimestamp(dynamicTime(timestamp)) : '';
});

const menuItems = computed(() => [
  {
    key: isUnread.value ? 'mark_as_read' : 'mark_as_unread',
    icon: isUnread.value ? 'i-lucide-mail-open' : 'i-lucide-mail',
    label: t(`INBOX.MENU_ITEM.MARK_AS_${isUnread.value ? 'READ' : 'UNREAD'}`),
  },
  {
    key: 'delete',
    icon: 'i-lucide-trash-2',
    label: t('INBOX.MENU_ITEM.DELETE'),
  },
]);

const messageClasses = computed(() => ({
  emphasis: isUnread.value
    ? getMessageClasses.emphasisUnread
    : getMessageClasses.emphasis,
  normal: isUnread.value
    ? getMessageClasses.normalUnread
    : getMessageClasses.normal,
}));

const formatPushMessage = message => {
  if (message.startsWith(': ')) {
    return message.slice(2);
  }

  return message.replace(/^([^:]+):/g, (match, name) => {
    return `<span class="${messageClasses.value.emphasis}">${name}:</span>`;
  });
};

const formattedMessage = computed(() => {
  const messageContent = `<span class="${messageClasses.value.normal}">${formatPushMessage(props.inboxItem?.pushMessageBody || '')}</span>`;

  return isUnread.value
    ? `<span class="inline-flex flex-shrink-0 w-2 h-2 mb-px rounded-full bg-n-iris-10 ltr:mr-1 rtl:ml-1"></span> ${messageContent}`
    : messageContent;
});

const notificationDetails = computed(() => {
  const type = props.inboxItem?.notificationType?.toUpperCase() || '';
  const [icon = '', color = 'text-n-blue-text'] =
    NOTIFICATION_TYPES_MAPPING[type] || [];
  return { text: type ? t(`INBOX.TYPES_NEXT.${type}`) : '', icon, color };
});

const snoozedUntilTime = computed(() => {
  const { snoozedUntil } = props.inboxItem;
  if (!snoozedUntil) return null;
  return shortenSnoozeTime(
    dynamicTime(snoozedReopenTimeToTimestamp(snoozedUntil))
  );
});

const hasLastSnoozed = computed(() => props.inboxItem?.meta?.lastSnoozedAt);

const snoozedText = computed(() => {
  return !hasLastSnoozed.value
    ? t('INBOX.TYPES_NEXT.SNOOZED_UNTIL', {
        time: shortTimestamp(snoozedUntilTime.value),
      })
    : t('INBOX.TYPES_NEXT.SNOOZED_ENDS');
});

const onContextMenuOpenChange = isOpen => {
  if (isOpen) emit('contextMenuOpen');
  else emit('contextMenuClose');
};

const onSelectAction = key => {
  const actions = {
    mark_as_read: () => emit('markNotificationAsRead', props.inboxItem),
    mark_as_unread: () => emit('markNotificationAsUnRead', props.inboxItem),
    delete: () => emit('deleteNotification', props.inboxItem),
  };
  actions[key]?.();
};
</script>

<template>
  <ContextMenu @update:open="onContextMenuOpenChange">
    <ContextMenuTrigger as-child>
      <div
        role="button"
        class="flex flex-col w-full gap-1 p-3 transition-all duration-300 ease-in-out cursor-pointer"
        @click="emit('click')"
      >
        <div class="flex items-start gap-2">
          <Avatar
            :name="assigneeMeta.name"
            :src="assigneeMeta.thumbnail"
            :size="20"
            rounded-full
            class="mt-1"
          />
          <p v-dompurify-html="formattedMessage" class="mb-0 line-clamp-2" />
        </div>
        <div class="flex items-center justify-between h-6 gap-2">
          <div class="flex items-center flex-1 min-w-0 gap-1">
            <div
              v-if="snoozedUntilTime || hasLastSnoozed"
              class="flex items-center w-full min-w-0 gap-2 ltr:pl-1 rtl:pr-1"
            >
              <Icon
                :icon="
                  !hasLastSnoozed
                    ? 'i-lucide-alarm-clock-plus'
                    : 'i-lucide-alarm-clock-off'
                "
                class="flex-shrink-0 size-4"
                :class="!isUnread ? 'text-n-slate-11' : 'text-n-blue-text'"
              />
              <span
                class="text-xs font-medium truncate"
                :class="!isUnread ? 'text-n-slate-11' : 'text-n-blue-text'"
              >
                {{ snoozedText }}
              </span>
            </div>
            <div
              v-else-if="notificationDetails.text"
              class="flex items-center w-full min-w-0 gap-2 ltr:pl-1 rtl:pr-1"
            >
              <Icon
                :icon="notificationDetails.icon"
                :class="
                  isUnread ? notificationDetails.color : 'text-n-slate-11'
                "
                class="flex-shrink-0 size-4"
              />
              <span
                class="text-xs font-medium truncate"
                :class="
                  isUnread ? notificationDetails.color : 'text-n-slate-11'
                "
              >
                {{ notificationDetails.text }}
              </span>
            </div>
          </div>
          <div class="flex items-center flex-shrink-0 gap-2">
            <SLACardLabel
              v-show="hasSlaThreshold"
              ref="slaCardLabel"
              :conversation="primaryActor"
              class="[&>span]:text-xs"
              :class="
                !isUnread &&
                '[&>span]:text-n-slate-11 [&>div>svg]:fill-n-slate-11'
              "
            />
            <div
              v-if="hasSlaThreshold"
              class="w-px h-3 rounded-sm bg-n-slate-4"
            />
            <CardPriorityIcon
              v-if="primaryActor?.priority"
              :priority="primaryActor?.priority"
              class="[&>svg]:size-4"
            />
            <div
              v-if="inboxIcon"
              v-tooltip.left="inbox?.name"
              class="flex items-center justify-center flex-shrink-0 rounded-full bg-n-alpha-2 size-4"
            >
              <Icon
                :icon="inboxIcon"
                class="flex-shrink-0 text-n-slate-11 size-2.5"
              />
            </div>
            <span class="text-xs text-n-slate-10">
              {{ lastActivityAt }}
            </span>
          </div>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48">
      <ContextMenuItem
        v-for="item in menuItems"
        :key="item.key"
        class="gap-2"
        :class="{ 'text-n-ruby-11': item.key === 'delete' }"
        @select="onSelectAction(item.key)"
      >
        <Icon :icon="item.icon" class="size-4" />
        {{ item.label }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
