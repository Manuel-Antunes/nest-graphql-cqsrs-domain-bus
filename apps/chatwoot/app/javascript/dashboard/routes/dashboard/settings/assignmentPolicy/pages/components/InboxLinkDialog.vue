<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { getInboxIconByType } from 'dashboard/helper/inbox';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';

const props = defineProps({
  inbox: {
    type: Object,
    default: null,
  },
  isLinking: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['link', 'dismiss']);

const { t } = useI18n();

const isOpen = ref(false);

const inboxName = computed(() => props.inbox?.name || '');

const inboxIcon = computed(() => {
  if (!props.inbox) return 'i-lucide-inbox';
  return getInboxIconByType(
    props.inbox.channelType,
    props.inbox.medium,
    'line',
    props.inbox.voiceEnabled
  );
});

const openDialog = () => {
  isOpen.value = true;
};

const closeDialog = () => {
  isOpen.value = false;
};

const handleConfirm = () => {
  emit('link');
};

const handleClose = () => {
  emit('dismiss');
};

const onOpenChange = val => {
  if (val) return;
  closeDialog();
  handleClose();
};

watch(
  () => props.inbox,
  async newInbox => {
    if (newInbox) {
      await nextTick();
      openDialog();
    } else {
      closeDialog();
    }
  },
  { immediate: true }
);

defineExpose({ openDialog, closeDialog });
</script>

<template>
  <Dialog :open="isOpen" @update:open="onOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.INBOX_LINK_PROMPT.TITLE'
            )
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.INBOX_LINK_PROMPT.DESCRIPTION'
            )
          }}
        </DialogDescription>
      </DialogHeader>

      <div
        class="flex items-center gap-3 p-3 rounded-xl border border-n-weak bg-n-alpha-1"
      >
        <div
          class="flex-shrink-0 size-10 rounded-lg bg-n-alpha-2 flex items-center justify-center"
        >
          <i :class="inboxIcon" class="text-lg text-n-slate-11" />
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-medium text-n-slate-12 truncate">
            {{ inboxName }}
          </span>
        </div>
      </div>

      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{
              t(
                'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.INBOX_LINK_PROMPT.CANCEL_BUTTON'
              )
            }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="isLinking"
          @click="handleConfirm"
        >
          <Spinner v-if="isLinking" class="size-4 flex-shrink-0" />
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.INBOX_LINK_PROMPT.LINK_BUTTON'
            )
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
