<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Policy from 'dashboard/components/policy.vue';
import { INBOX_TYPES, getInboxIconByType } from 'dashboard/helper/inbox';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  id: {
    type: Number,
    required: true,
  },
  inbox: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['action']);

const { t } = useI18n();

const isOpen = ref(false);

const inboxName = computed(() => {
  const inbox = props.inbox;
  if (!inbox?.name) {
    return '';
  }

  const isTwilioChannel = inbox.channel_type === INBOX_TYPES.TWILIO;
  const isWhatsAppChannel = inbox.channel_type === INBOX_TYPES.WHATSAPP;
  const isEmailChannel = inbox.channel_type === INBOX_TYPES.EMAIL;

  if (isTwilioChannel || isWhatsAppChannel) {
    const identifier = inbox.messaging_service_sid || inbox.phone_number;
    return identifier ? `${inbox.name} (${identifier})` : inbox.name;
  }

  if (isEmailChannel && inbox.email) {
    return `${inbox.name} (${inbox.email})`;
  }

  return inbox.name;
});

const menuItems = computed(() => [
  {
    label: t('CAPTAIN.INBOXES.OPTIONS.DISCONNECT'),
    value: 'delete',
    action: 'delete',
    icon: 'i-lucide-trash',
  },
]);

const icon = computed(() => {
  const {
    medium,
    channel_type: type,
    voice_enabled: voiceEnabled,
  } = props.inbox;
  return getInboxIconByType(type, medium, 'outline', voiceEnabled);
});

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};
</script>

<template>
  <CardLayout>
    <div class="flex justify-between w-full gap-1">
      <span
        class="text-base text-n-slate-12 line-clamp-1 flex items-center gap-2"
      >
        <span :class="icon" />
        {{ inboxName }}
      </span>
      <div class="flex items-center gap-2">
        <Policy :permissions="['administrator']">
          <Popover v-model:open="isOpen">
            <PopoverTrigger as-child>
              <Button variant="outline" size="icon">
                <Icon icon="i-lucide-ellipsis-vertical" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              class="flex flex-col p-1 w-auto min-w-36"
            >
              <Button
                v-for="item in menuItems"
                :key="item.value"
                variant="ghost"
                class="justify-start"
                :class="
                  item.action === 'delete'
                    ? 'text-destructive hover:text-destructive'
                    : ''
                "
                :disabled="item.disabled"
                @click="handleAction(item)"
              >
                <Icon
                  v-if="item.icon"
                  :icon="item.icon"
                  class="size-3.5 flex-shrink-0"
                />
                <span v-if="item.emoji" class="flex-shrink-0">{{
                  item.emoji
                }}</span>
                {{ item.label }}
              </Button>
            </PopoverContent>
          </Popover>
        </Policy>
      </div>
    </div>
  </CardLayout>
</template>
