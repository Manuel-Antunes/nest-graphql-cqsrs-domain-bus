<script>
import ConversationCard from 'dashboard/components/widgets/conversation/ConversationCard.vue';
import { mapGetters } from 'vuex';
import { Spinner } from 'dashboard/components-next/ui/spinner';

export default {
  components: {
    ConversationCard,
    Spinner,
  },
  props: {
    contactId: {
      type: [String, Number],
      required: true,
    },
    conversationId: {
      type: [String, Number],
      required: true,
    },
  },
  computed: {
    conversations() {
      return this.$store.getters['contactConversations/getContactConversation'](
        this.contactId
      );
    },
    previousConversations() {
      return this.conversations.filter(
        conversation => conversation.id !== Number(this.conversationId)
      );
    },
    ...mapGetters({
      uiFlags: 'contactConversations/getUIFlags',
    }),
  },
  watch: {
    contactId(newContactId, prevContactId) {
      if (newContactId && newContactId !== prevContactId) {
        this.$store.dispatch('contactConversations/get', newContactId);
      }
    },
  },
  mounted() {
    this.$store.dispatch('contactConversations/get', this.contactId);
  },
};
</script>

<template>
  <div v-if="!uiFlags.isFetching" class="">
    <div v-if="!previousConversations.length" class="flex justify-center">
      <span class="p-4 text-sm leading-6 text-center text-muted-foreground">
        {{ $t('CONTACT_PANEL.CONVERSATIONS.NO_RECORDS_FOUND') }}
      </span>
    </div>
    <div v-else class="contact-conversation--list">
      <ConversationCard
        v-for="conversation in previousConversations"
        :key="conversation.id"
        :chat="conversation"
        :hide-inbox-name="false"
        hide-thumbnail
        enable-context-menu
        compact
        :allowed-context-menu-options="['open-new-tab', 'copy-link']"
      />
    </div>
  </div>
  <div v-else class="flex items-center justify-center py-5">
    <Spinner class="size-6" />
  </div>
</template>

<style lang="scss" scoped>
.no-label-message {
  @apply text-n-slate-11 mb-4;
}
</style>
