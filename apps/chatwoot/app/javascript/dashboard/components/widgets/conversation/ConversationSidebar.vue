<script setup>
import ContactDialog from 'dashboard/routes/dashboard/conversation/ContactDialog.vue';

defineProps({
  currentChat: {
    required: true,
    type: Object,
  },
});
</script>

<template>
  <ContactDialog
    :conversation-id="currentChat.id"
    :inbox-id="currentChat.inbox_id"
  />
</template>
