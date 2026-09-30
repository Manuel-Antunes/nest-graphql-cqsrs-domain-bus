<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button/Select component names */
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import SettingsFieldSection from 'dashboard/components-next/Settings/SettingsFieldSection.vue';
import LoadingState from 'dashboard/components/widgets/LoadingState.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

export default {
  components: {
    LoadingState,
    SettingsFieldSection,
    Button,
    Spinner,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  props: {
    inbox: {
      type: Object,
      default: () => ({}),
    },
  },
  setup() {
    const { currentParams } = useAppNavigation();
    return { currentParams };
  },
  data() {
    return {
      selectedAgentBotId: null,
    };
  },
  computed: {
    ...mapGetters({
      agentBots: 'agentBots/getBots',
      uiFlags: 'agentBots/getUIFlags',
    }),
    currentInboxId() {
      return this.inbox?.id || this.currentParams.inboxId;
    },
    activeAgentBot() {
      return this.$store.getters['agentBots/getActiveAgentBot'](
        this.currentInboxId
      );
    },
  },
  watch: {
    activeAgentBot() {
      this.selectedAgentBotId = this.activeAgentBot.id;
    },
  },
  mounted() {
    this.fetchBotData();
  },

  methods: {
    fetchBotData() {
      this.$store.dispatch('agentBots/get');
      this.$store.dispatch('agentBots/fetchAgentBotInbox', this.currentInboxId);
    },
    async updateActiveAgentBot() {
      try {
        await this.$store.dispatch('agentBots/setAgentBotInbox', {
          inboxId: this.inbox.id,
          // Added this to make sure that empty values are not sent to the API
          botId: this.selectedAgentBotId ? this.selectedAgentBotId : undefined,
        });
        useAlert(this.$t('AGENT_BOTS.BOT_CONFIGURATION.SUCCESS_MESSAGE'));
      } catch (error) {
        useAlert(this.$t('AGENT_BOTS.BOT_CONFIGURATION.ERROR_MESSAGE'));
      }
    },
    async disconnectBot() {
      try {
        await this.$store.dispatch('agentBots/disconnectBot', {
          inboxId: this.inbox.id,
        });
        useAlert(
          this.$t('AGENT_BOTS.BOT_CONFIGURATION.DISCONNECTED_SUCCESS_MESSAGE')
        );
      } catch (error) {
        useAlert(
          error?.message ||
            this.$t('AGENT_BOTS.BOT_CONFIGURATION.DISCONNECTED_ERROR_MESSAGE')
        );
      }
    },
  },
};
</script>

<template>
  <div class="mx-6 max-w-4xl">
    <LoadingState v-if="uiFlags.isFetching || uiFlags.isFetchingAgentBot" />
    <form v-else @submit.prevent="updateActiveAgentBot">
      <SettingsFieldSection
        :label="$t('AGENT_BOTS.BOT_CONFIGURATION.TITLE')"
        :help-text="$t('AGENT_BOTS.BOT_CONFIGURATION.DESC')"
        class="[&>div]:!items-start"
      >
        <Select
          :model-value="
            selectedAgentBotId != null ? String(selectedAgentBotId) : ''
          "
          @update:model-value="v => (selectedAgentBotId = v ? Number(v) : null)"
        >
          <SelectTrigger class="w-full">
            <SelectValue
              :placeholder="
                $t('AGENT_BOTS.BOT_CONFIGURATION.SELECT_PLACEHOLDER')
              "
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="agentBot in agentBots"
              :key="agentBot.id"
              :value="String(agentBot.id)"
            >
              {{ agentBot.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <template #extra>
          <div class="grid grid-cols-1 lg:grid-cols-8 mt-3">
            <div class="col-span-1 lg:col-span-2 invisible" />
            <div class="col-span-1 lg:col-span-6 flex gap-2 mx-1">
              <Button type="submit" :disabled="uiFlags.isSettingAgentBot">
                <Spinner
                  v-if="uiFlags.isSettingAgentBot"
                  class="size-4 flex-shrink-0"
                />
                <template v-if="!uiFlags.isSettingAgentBot">
                  {{ $t('AGENT_BOTS.BOT_CONFIGURATION.SUBMIT') }}
                </template>
              </Button>
              <Button
                type="button"
                variant="destructive"
                :disabled="!selectedAgentBotId || uiFlags.isDisconnecting"
                @click="disconnectBot"
              >
                <Spinner
                  v-if="uiFlags.isDisconnecting"
                  class="size-4 flex-shrink-0"
                />
                <template v-if="!uiFlags.isDisconnecting">
                  {{ $t('AGENT_BOTS.BOT_CONFIGURATION.DISCONNECT') }}
                </template>
              </Button>
            </div>
          </div>
        </template>
      </SettingsFieldSection>
    </form>
  </div>
</template>
