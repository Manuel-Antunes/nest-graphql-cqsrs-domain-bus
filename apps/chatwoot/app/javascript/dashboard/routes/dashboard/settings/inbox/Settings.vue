<script>
import { mapGetters } from 'vuex';
import { shouldBeUrl } from 'shared/helpers/Validators';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useVuelidate } from '@vuelidate/core';
import Avatar from 'next/avatar/Avatar.vue';
import SettingIntroBanner from 'dashboard/components/widgets/SettingIntroBanner.vue';
import SettingsSection from '../../../../components/SettingsSection.vue';
import inboxMixin from 'shared/mixins/inboxMixin';
import FacebookReauthorize from './facebook/Reauthorize.vue';
import InstagramReauthorize from './channels/instagram/Reauthorize.vue';
import TiktokReauthorize from './channels/tiktok/Reauthorize.vue';
import DuplicateInboxBanner from './channels/instagram/DuplicateInboxBanner.vue';
import MicrosoftReauthorize from './channels/microsoft/Reauthorize.vue';
import GoogleReauthorize from './channels/google/Reauthorize.vue';
import WhatsappReauthorize from './channels/whatsapp/Reauthorize.vue';
import InboxHealthAPI from 'dashboard/api/inboxHealth';
import PreChatFormSettings from './PreChatForm/Settings.vue';
import WeeklyAvailability from './components/WeeklyAvailability.vue';
import GreetingsEditor from 'shared/components/GreetingsEditor.vue';
import ConfigurationPage from './settingsPage/ConfigurationPage.vue';
import CustomerSatisfactionPage from './settingsPage/CustomerSatisfactionPage.vue';
import CollaboratorsPage from './settingsPage/CollaboratorsPage.vue';
import WidgetBuilder from './WidgetBuilder.vue';
import BotConfiguration from './components/BotConfiguration.vue';
import AccountHealth from './components/AccountHealth.vue';
import { FEATURE_FLAGS } from '../../../../featureFlags';
import SenderNameExamplePreview from './components/SenderNameExamplePreview.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Switch } from 'dashboard/components-next/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { Tabs, TabsList, TabsTrigger } from 'dashboard/components-next/ui/tabs';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { INBOX_TYPES } from 'dashboard/helper/inbox';
import { getInboxIconByType } from 'dashboard/helper/inbox';
import Editor from 'dashboard/components-next/Editor/Editor.vue';
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';

export default {
  components: {
    BotConfiguration,
    Input,
    Label,
    Checkbox,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    CollaboratorsPage,
    ConfigurationPage,
    CustomerSatisfactionPage,
    FacebookReauthorize,
    GreetingsEditor,
    PreChatFormSettings,
    SettingIntroBanner,
    SettingsSection,
    WeeklyAvailability,
    WidgetBuilder,
    SenderNameExamplePreview,
    MicrosoftReauthorize,
    GoogleReauthorize,
    Button,
    Tabs,
    TabsList,
    TabsTrigger,
    Spinner,
    InstagramReauthorize,
    TiktokReauthorize,
    WhatsappReauthorize,
    DuplicateInboxBanner,
    Editor,
    Avatar,
    AccountHealth,
    ColorPicker,
  },
  mixins: [inboxMixin],
  setup() {
    const { currentParams, currentRouteName, currentPath } = useAppNavigation();
    return { v$: useVuelidate(), currentParams, currentRouteName, currentPath };
  },
  data() {
    return {
      avatarFile: null,
      avatarUrl: '',
      greetingEnabled: true,
      greetingMessage: '',
      emailCollectEnabled: false,
      senderNameType: 'friendly',
      businessName: '',
      locktoSingleConversation: false,
      allowMessagesAfterResolved: true,
      continuityViaEmail: true,
      selectedInboxName: '',
      channelWebsiteUrl: '',
      webhookUrl: '',
      channelWelcomeTitle: '',
      channelWelcomeTagline: '',
      selectedFeatureFlags: [],
      replyTime: '',
      selectedTabIndex: 0,
      selectedPortalSlug: '',
      showBusinessNameInput: false,
      healthData: null,
      isLoadingHealth: false,
      healthError: null,
    };
  },
  computed: {
    ...mapGetters({
      accountId: 'getCurrentAccountId',
      isFeatureEnabledonAccount: 'accounts/isFeatureEnabledonAccount',
      uiFlags: 'inboxes/getUIFlags',
      portals: 'portals/allPortals',
    }),
    selectedTabKey() {
      return this.tabs[this.selectedTabIndex]?.key;
    },
    shouldShowWhatsAppConfiguration() {
      return this.isAWhatsAppCloudChannel;
    },
    whatsAppAPIProviderName() {
      if (this.isAWhatsAppCloudChannel) {
        return this.$t('INBOX_MGMT.ADD.WHATSAPP.PROVIDERS.WHATSAPP_CLOUD');
      }
      if (this.is360DialogWhatsAppChannel) {
        return this.$t('INBOX_MGMT.ADD.WHATSAPP.PROVIDERS.360_DIALOG');
      }
      if (this.isATwilioWhatsAppChannel) {
        return this.$t('INBOX_MGMT.ADD.WHATSAPP.PROVIDERS.TWILIO');
      }
      return '';
    },
    tabs() {
      let visibleToAllChannelTabs = [
        {
          key: 'inbox-settings',
          name: this.$t('INBOX_MGMT.TABS.SETTINGS'),
        },
        {
          key: 'collaborators',
          name: this.$t('INBOX_MGMT.TABS.COLLABORATORS'),
        },
      ];

      if (!this.isAVoiceChannel) {
        visibleToAllChannelTabs = [
          ...visibleToAllChannelTabs,
          {
            key: 'business-hours',
            name: this.$t('INBOX_MGMT.TABS.BUSINESS_HOURS'),
          },
          {
            key: 'csat',
            name: this.$t('INBOX_MGMT.TABS.CSAT'),
          },
        ];
      }

      if (this.isAWebWidgetInbox) {
        visibleToAllChannelTabs = [
          ...visibleToAllChannelTabs,
          {
            key: 'pre-chat-form',
            name: this.$t('INBOX_MGMT.TABS.PRE_CHAT_FORM'),
          },
          {
            key: 'widget-builder',
            name: this.$t('INBOX_MGMT.TABS.WIDGET_BUILDER'),
          },
        ];
      }

      if (
        this.isATwilioChannel ||
        this.isALineChannel ||
        this.isAPIInbox ||
        this.isAVoiceChannel ||
        (this.isAnEmailChannel && !this.inbox.provider) ||
        this.shouldShowWhatsAppConfiguration ||
        this.isAWebWidgetInbox
      ) {
        visibleToAllChannelTabs = [
          ...visibleToAllChannelTabs,
          {
            key: 'configuration',
            name: this.$t('INBOX_MGMT.TABS.CONFIGURATION'),
          },
        ];
      }

      if (
        this.isFeatureEnabledonAccount(this.accountId, FEATURE_FLAGS.AGENT_BOTS)
      ) {
        visibleToAllChannelTabs = [
          ...visibleToAllChannelTabs,
          {
            key: 'bot-configuration',
            name: this.$t('INBOX_MGMT.TABS.BOT_CONFIGURATION'),
          },
        ];
      }
      if (this.shouldShowWhatsAppConfiguration) {
        visibleToAllChannelTabs = [
          ...visibleToAllChannelTabs,
          {
            key: 'whatsapp-health',
            name: this.$t('INBOX_MGMT.TABS.ACCOUNT_HEALTH'),
          },
        ];
      }

      return visibleToAllChannelTabs;
    },
    currentInboxId() {
      return this.currentParams.inboxId;
    },
    inbox() {
      return this.$store.getters['inboxes/getInbox'](this.currentInboxId);
    },
    inboxIcon() {
      const { medium, channel_type: type } = this.inbox;
      return getInboxIconByType(type, medium);
    },
    inboxName() {
      if (this.isATwilioSMSChannel || this.isATwilioWhatsAppChannel) {
        return `${this.inbox.name} (${
          this.inbox.messaging_service_sid || this.inbox.phone_number
        })`;
      }
      if (this.isAWhatsAppChannel) {
        return `${this.inbox.name} (${this.inbox.phone_number})`;
      }
      if (this.isAnEmailChannel) {
        return `${this.inbox.name} (${this.inbox.email})`;
      }
      return this.inbox.name;
    },
    canLocktoSingleConversation() {
      return (
        this.isASmsInbox ||
        this.isAWhatsAppChannel ||
        this.isAFacebookInbox ||
        this.isAPIInbox ||
        this.isATelegramChannel
      );
    },
    inboxNameLabel() {
      if (this.isAWebWidgetInbox) {
        return this.$t('INBOX_MGMT.ADD.WEBSITE_NAME.LABEL');
      }
      return this.$t('INBOX_MGMT.ADD.CHANNEL_NAME.LABEL');
    },
    inboxNamePlaceHolder() {
      if (this.isAWebWidgetInbox) {
        return this.$t('INBOX_MGMT.ADD.WEBSITE_NAME.PLACEHOLDER');
      }
      return this.$t('INBOX_MGMT.ADD.CHANNEL_NAME.PLACEHOLDER');
    },
    textAreaChannels() {
      if (
        this.isATwilioChannel ||
        this.isATwitterInbox ||
        this.isAFacebookInbox
      )
        return true;
      return false;
    },
    instagramUnauthorized() {
      return this.isAnInstagramChannel && this.inbox.reauthorization_required;
    },
    tiktokUnauthorized() {
      return this.isATiktokChannel && this.inbox.reauthorization_required;
    },
    // Check if a instagram inbox exists with the same instagram_id
    hasDuplicateInstagramInbox() {
      const instagramId = this.inbox.instagram_id;
      const instagramInbox =
        this.$store.getters['inboxes/getInstagramInboxByInstagramId'](
          instagramId
        );

      return this.inbox.channel_type === INBOX_TYPES.FB && instagramInbox;
    },
    microsoftUnauthorized() {
      return this.isAMicrosoftInbox && this.inbox.reauthorization_required;
    },
    facebookUnauthorized() {
      return this.isAFacebookInbox && this.inbox.reauthorization_required;
    },
    googleUnauthorized() {
      const isLegacyInbox = ['imap.gmail.com', 'imap.google.com'].includes(
        this.inbox.imap_address
      );

      return (
        (this.isAGoogleInbox || isLegacyInbox) &&
        this.inbox.reauthorization_required
      );
    },
    isEmbeddedSignupWhatsApp() {
      return this.inbox.provider_config?.source === 'embedded_signup';
    },
    whatsappUnauthorized() {
      return (
        this.isAWhatsAppCloudChannel &&
        this.isEmbeddedSignupWhatsApp &&
        this.inbox.reauthorization_required
      );
    },
    whatsappRegistrationIncomplete() {
      if (
        !this.healthData ||
        !this.isAWhatsAppCloudChannel ||
        !this.isEmbeddedSignupWhatsApp
      ) {
        return false;
      }

      return (
        this.healthData.platform_type === 'NOT_APPLICABLE' ||
        this.healthData.throughput?.level === 'NOT_APPLICABLE'
      );
    },
  },
  watch: {
    currentPath() {
      if (this.currentRouteName === 'settings_inbox_show') {
        this.fetchInboxSettings();
      }
    },
    inbox: {
      handler() {
        this.fetchHealthData();
      },
      immediate: false,
    },
  },
  mounted() {
    this.fetchInboxSettings();
    this.fetchPortals();
    this.fetchHealthData();
  },
  methods: {
    fetchPortals() {
      this.$store.dispatch('portals/index');
    },
    async fetchHealthData() {
      if (!this.inbox) return;

      if (!this.isAWhatsAppCloudChannel) {
        return;
      }

      try {
        this.isLoadingHealth = true;
        this.healthError = null;
        const response = await InboxHealthAPI.getHealthStatus(this.inbox.id);
        this.healthData = response.data;
      } catch (error) {
        this.healthError = error.message || 'Failed to fetch health data';
      } finally {
        this.isLoadingHealth = false;
      }
    },
    handleFeatureFlag(flag) {
      this.selectedFeatureFlags = this.toggleInput(
        this.selectedFeatureFlags,
        flag
      );
    },
    toggleInput(selected, current) {
      if (selected.includes(current)) {
        const newSelectedFlags = selected.filter(flag => flag !== current);
        return newSelectedFlags;
      }
      return [...selected, current];
    },
    refreshAvatarUrlOnTabChange(index) {
      // Refresh avatar URL on tab change from inbox-settings and widget-builder tabs, to ensure real-time updates
      if (
        this.inbox &&
        ['inbox-settings', 'widget-builder'].includes(this.tabs[index].key)
      )
        this.avatarUrl = this.inbox.avatar_url;
    },
    onTabChange(selectedTabIndex) {
      this.selectedTabIndex = selectedTabIndex;
      this.refreshAvatarUrlOnTabChange(selectedTabIndex);
      this.updateRouteWithoutRefresh(selectedTabIndex);
    },
    updateRouteWithoutRefresh(selectedTabIndex) {
      const tab = this.tabs[selectedTabIndex];
      if (!tab) return;

      const { accountId, inboxId } = this.currentParams;
      const baseUrl = `/app/accounts/${accountId}/settings/inboxes/${inboxId}`;

      // Append the tab key only if it's not the default.
      const newUrl =
        tab.key === 'inbox-settings' ? baseUrl : `${baseUrl}/${tab.key}`;
      // Update URL without triggering route watcher
      window.history.replaceState(null, '', newUrl);
    },
    setTabFromRouteParam() {
      const { tab: tabParam } = this.currentParams;
      if (!tabParam) return;
      const tabIndex = this.tabs.findIndex(tab => tab.key === tabParam);

      this.selectedTabIndex = tabIndex === -1 ? 0 : tabIndex;
    },
    fetchInboxSettings() {
      this.selectedAgents = [];
      this.$store.dispatch('agents/get');
      this.$store.dispatch('teams/get');
      this.$store.dispatch('labels/get');
      this.$store.dispatch('inboxes/get').then(() => {
        this.avatarUrl = this.inbox.avatar_url;
        this.selectedInboxName = this.inbox.name;
        this.webhookUrl = this.inbox.webhook_url;
        this.greetingEnabled = this.inbox.greeting_enabled || false;
        this.greetingMessage = this.inbox.greeting_message || '';
        this.emailCollectEnabled = this.inbox.enable_email_collect;
        this.senderNameType = this.inbox.sender_name_type;
        this.businessName = this.inbox.business_name;
        this.allowMessagesAfterResolved =
          this.inbox.allow_messages_after_resolved;
        this.continuityViaEmail = this.inbox.continuity_via_email;
        this.channelWebsiteUrl = this.inbox.website_url;
        this.channelWelcomeTitle = this.inbox.welcome_title;
        this.channelWelcomeTagline = this.inbox.welcome_tagline || '';
        this.selectedFeatureFlags = this.inbox.selected_feature_flags || [];
        this.replyTime = this.inbox.reply_time;
        this.locktoSingleConversation = this.inbox.lock_to_single_conversation;
        this.selectedPortalSlug = this.inbox.help_center
          ? this.inbox.help_center.slug
          : '';

        // Set initial tab after inbox data is loaded
        this.setTabFromRouteParam();
      });
    },
    async updateInbox() {
      try {
        const payload = {
          id: this.currentInboxId,
          name: this.selectedInboxName?.trim(),
          enable_email_collect: this.emailCollectEnabled,
          allow_messages_after_resolved: this.allowMessagesAfterResolved,
          greeting_enabled: this.greetingEnabled,
          greeting_message: this.greetingMessage || '',
          portal_id: this.selectedPortalSlug
            ? this.portals.find(
                portal => portal.slug === this.selectedPortalSlug
              ).id
            : null,
          lock_to_single_conversation: this.locktoSingleConversation,
          sender_name_type: this.senderNameType,
          business_name: this.businessName || null,
          channel: {
            widget_color: this.inbox.widget_color,
            website_url: this.channelWebsiteUrl,
            webhook_url: this.webhookUrl,
            welcome_title: this.channelWelcomeTitle || '',
            welcome_tagline: this.channelWelcomeTagline || '',
            selectedFeatureFlags: this.selectedFeatureFlags,
            reply_time: this.replyTime || 'in_a_few_minutes',
            continuity_via_email: this.continuityViaEmail,
          },
        };
        if (this.avatarFile) {
          payload.avatar = this.avatarFile;
        }
        await this.$store.dispatch('inboxes/updateInbox', payload);
        useAlert(this.$t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
      } catch (error) {
        useAlert(error.message || this.$t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE'));
      }
    },
    handleImageUpload({ file, url }) {
      this.avatarFile = file;
      this.avatarUrl = url;
    },
    async handleAvatarDelete() {
      try {
        await this.$store.dispatch(
          'inboxes/deleteInboxAvatar',
          this.currentInboxId
        );
        this.avatarFile = null;
        this.avatarUrl = '';
        useAlert(this.$t('INBOX_MGMT.DELETE.API.AVATAR_SUCCESS_MESSAGE'));
      } catch (error) {
        useAlert(
          error.message
            ? error.message
            : this.$t('INBOX_MGMT.DELETE.API.AVATAR_ERROR_MESSAGE')
        );
      }
    },
    toggleSenderNameType(key) {
      this.senderNameType = key;
    },
    onClickShowBusinessNameInput() {
      this.showBusinessNameInput = !this.showBusinessNameInput;
      if (this.showBusinessNameInput) {
        this.$nextTick(() => {
          this.$refs.businessNameInput.focus();
        });
      }
    },
  },
  validations: {
    webhookUrl: {
      shouldBeUrl,
    },
    selectedInboxName: {},
  },
};
</script>

<template>
  <div
    class="overflow-auto flex-grow flex-shrink pr-0 pl-0 w-full min-w-0 settings"
  >
    <SettingIntroBanner
      :header-image="inbox.avatarUrl"
      :header-title="inboxName"
    >
      <Tabs
        class="max-w-full"
        :model-value="String(selectedTabIndex)"
        @update:model-value="val => onTabChange(Number(val))"
      >
        <TabsList
          class="justify-start max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsTrigger
            v-for="(tab, index) in tabs"
            :key="tab.key"
            :value="String(index)"
            class="shrink-0"
          >
            {{ tab.name }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </SettingIntroBanner>
    <section class="mx-auto w-full max-w-6xl">
      <MicrosoftReauthorize v-if="microsoftUnauthorized" :inbox="inbox" />
      <FacebookReauthorize v-if="facebookUnauthorized" :inbox="inbox" />
      <GoogleReauthorize v-if="googleUnauthorized" :inbox="inbox" />
      <InstagramReauthorize v-if="instagramUnauthorized" :inbox="inbox" />
      <TiktokReauthorize v-if="tiktokUnauthorized" :inbox="inbox" />
      <WhatsappReauthorize
        v-if="whatsappUnauthorized"
        :whatsapp-registration-incomplete="whatsappRegistrationIncomplete"
        :inbox="inbox"
      />
      <DuplicateInboxBanner
        v-if="hasDuplicateInstagramInbox"
        :content="$t('INBOX_MGMT.ADD.INSTAGRAM.DUPLICATE_INBOX_BANNER')"
        class="mx-8 mt-5"
      />
      <div v-if="selectedTabKey === 'inbox-settings'" class="mx-8">
        <SettingsSection
          :title="$t('INBOX_MGMT.SETTINGS_POPUP.INBOX_UPDATE_TITLE')"
          :sub-title="$t('INBOX_MGMT.SETTINGS_POPUP.INBOX_UPDATE_SUB_TEXT')"
          :show-border="false"
        >
          <div class="flex flex-col gap-1 items-start mb-4">
            <Label class="mb-0.5 text-sm font-medium text-n-slate-12">
              {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_AVATAR.LABEL') }}
            </Label>
            <Avatar
              :src="avatarUrl"
              :size="72"
              :icon-name="inboxIcon"
              name=""
              allow-upload
              rounded-full
              @upload="handleImageUpload"
              @delete="handleAvatarDelete"
            />
          </div>
          <div class="flex flex-col gap-1 pb-4">
            <Label>{{ inboxNameLabel }}</Label>
            <Input
              v-model="selectedInboxName"
              :aria-invalid="v$.selectedInboxName.$error || undefined"
              :placeholder="inboxNamePlaceHolder"
              @blur="v$.selectedInboxName.$touch"
            />
            <p v-if="v$.selectedInboxName.$error" class="text-sm text-n-ruby-9">
              {{ $t('INBOX_MGMT.ADD.CHANNEL_NAME.ERROR') }}
            </p>
          </div>
          <div
            v-if="isAPIInbox && !isAnEvolutionApiInbox"
            class="flex flex-col gap-1 pb-4"
          >
            <Label>
              {{
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WEBHOOK_URL.LABEL')
              }}
            </Label>
            <Input
              v-model="webhookUrl"
              :aria-invalid="v$.webhookUrl.$error || undefined"
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WEBHOOK_URL.PLACEHOLDER'
                )
              "
              @blur="v$.webhookUrl.$touch"
            />
            <p v-if="v$.webhookUrl.$error" class="text-sm text-n-ruby-9">
              {{
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WEBHOOK_URL.ERROR')
              }}
            </p>
          </div>
          <div v-if="isAWebWidgetInbox" class="flex flex-col gap-1 pb-4">
            <Label>
              {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_DOMAIN.LABEL') }}
            </Label>
            <Input
              v-model="channelWebsiteUrl"
              :placeholder="
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_DOMAIN.PLACEHOLDER')
              "
            />
          </div>
          <div v-if="isAWebWidgetInbox" class="flex flex-col gap-1 pb-4">
            <Label>
              {{
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TITLE.LABEL')
              }}
            </Label>
            <Input
              v-model="channelWelcomeTitle"
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TITLE.PLACEHOLDER'
                )
              "
            />
          </div>

          <Editor
            v-if="isAWebWidgetInbox"
            v-model="channelWelcomeTagline"
            class="mb-4"
            :label="
              $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TAGLINE.LABEL')
            "
            :placeholder="
              $t(
                'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TAGLINE.PLACEHOLDER'
              )
            "
            :max-length="255"
            channel-type="Context::InboxSettings"
          />

          <Label
            v-if="isAWebWidgetInbox"
            class="flex-col items-stretch gap-1 pb-4"
          >
            {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.WIDGET_COLOR.LABEL') }}
            <ColorPicker v-model="inbox.widget_color" />
          </Label>

          <Label
            v-if="isAWhatsAppChannel"
            class="flex-col items-stretch gap-1 pb-4"
          >
            {{ $t('INBOX_MGMT.ADD.WHATSAPP.PROVIDERS.LABEL') }}
            <Input v-model="whatsAppAPIProviderName" type="text" disabled />
          </Label>

          <div class="pb-4">
            <div class="flex items-center justify-between gap-2">
              <Label class="mb-0">
                {{
                  $t(
                    'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_TOGGLE.LABEL'
                  )
                }}
              </Label>
              <Switch v-model="greetingEnabled" />
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_TOGGLE.HELP_TEXT'
                )
              }}
            </p>
          </div>
          <div v-if="greetingEnabled" class="pb-4">
            <GreetingsEditor
              v-model="greetingMessage"
              :label="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_MESSAGE.LABEL'
                )
              "
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_MESSAGE.PLACEHOLDER'
                )
              "
              :richtext="!textAreaChannels"
            />
          </div>
          <Label
            v-if="isAWebWidgetInbox"
            class="flex-col items-stretch gap-1 pb-4"
          >
            {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.REPLY_TIME.TITLE') }}
            <Select v-model="replyTime">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_a_few_minutes">
                  {{
                    $t(
                      'INBOX_MGMT.ADD.WEBSITE_CHANNEL.REPLY_TIME.IN_A_FEW_MINUTES'
                    )
                  }}
                </SelectItem>
                <SelectItem value="in_a_few_hours">
                  {{
                    $t(
                      'INBOX_MGMT.ADD.WEBSITE_CHANNEL.REPLY_TIME.IN_A_FEW_HOURS'
                    )
                  }}
                </SelectItem>
                <SelectItem value="in_a_day">
                  {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.REPLY_TIME.IN_A_DAY') }}
                </SelectItem>
              </SelectContent>
            </Select>

            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.REPLY_TIME.HELP_TEXT') }}
            </p>
          </Label>

          <div v-if="isAWebWidgetInbox" class="pb-4">
            <div class="flex items-center justify-between gap-2">
              <Label class="mb-0">
                {{ $t('INBOX_MGMT.SETTINGS_POPUP.ENABLE_EMAIL_COLLECT_BOX') }}
              </Label>
              <Switch v-model="emailCollectEnabled" />
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.ENABLE_EMAIL_COLLECT_BOX_SUB_TEXT'
                )
              }}
            </p>
          </div>

          <div v-if="isAWebWidgetInbox" class="pb-4">
            <div class="flex items-center justify-between gap-2">
              <Label class="mb-0">
                {{
                  $t('INBOX_MGMT.SETTINGS_POPUP.ALLOW_MESSAGES_AFTER_RESOLVED')
                }}
              </Label>
              <Switch v-model="allowMessagesAfterResolved" />
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.ALLOW_MESSAGES_AFTER_RESOLVED_SUB_TEXT'
                )
              }}
            </p>
          </div>

          <div v-if="isAWebWidgetInbox" class="pb-4">
            <div class="flex items-center justify-between gap-2">
              <Label class="mb-0">
                {{
                  $t('INBOX_MGMT.SETTINGS_POPUP.ENABLE_CONTINUITY_VIA_EMAIL')
                }}
              </Label>
              <Switch v-model="continuityViaEmail" />
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.ENABLE_CONTINUITY_VIA_EMAIL_SUB_TEXT'
                )
              }}
            </p>
          </div>
          <div v-if="!isAVoiceChannel" class="pb-4">
            <Label class="flex-col items-stretch gap-1">
              {{ $t('INBOX_MGMT.HELP_CENTER.LABEL') }}
            </Label>
            <Select
              :model-value="selectedPortalSlug || 'none'"
              @update:model-value="
                v => (selectedPortalSlug = v === 'none' ? '' : v)
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {{ $t('INBOX_MGMT.HELP_CENTER.PLACEHOLDER') }}
                </SelectItem>
                <SelectItem v-for="p in portals" :key="p.slug" :value="p.slug">
                  {{ p.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{ $t('INBOX_MGMT.HELP_CENTER.SUB_TEXT') }}
            </p>
          </div>
          <div v-if="canLocktoSingleConversation" class="pb-4">
            <div class="flex items-center justify-between gap-2">
              <Label class="mb-0">
                {{
                  $t('INBOX_MGMT.SETTINGS_POPUP.LOCK_TO_SINGLE_CONVERSATION')
                }}
              </Label>
              <Switch v-model="locktoSingleConversation" />
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.LOCK_TO_SINGLE_CONVERSATION_SUB_TEXT'
                )
              }}
            </p>
          </div>

          <Label v-if="isAWebWidgetInbox">
            {{ $t('INBOX_MGMT.FEATURES.LABEL') }}
          </Label>
          <div v-if="isAWebWidgetInbox" class="flex gap-2 pt-2 pb-4">
            <Checkbox
              :checked="selectedFeatureFlags.includes('attachments')"
              @update:checked="() => handleFeatureFlag('attachments')"
            />
            <Label for="attachments">
              {{ $t('INBOX_MGMT.FEATURES.DISPLAY_FILE_PICKER') }}
            </Label>
          </div>
          <div v-if="isAWebWidgetInbox" class="flex gap-2 pb-4">
            <Checkbox
              :checked="selectedFeatureFlags.includes('emoji_picker')"
              @update:checked="() => handleFeatureFlag('emoji_picker')"
            />
            <Label for="emoji_picker">
              {{ $t('INBOX_MGMT.FEATURES.DISPLAY_EMOJI_PICKER') }}
            </Label>
          </div>
          <div v-if="isAWebWidgetInbox" class="flex gap-2 pb-4">
            <Checkbox
              :checked="selectedFeatureFlags.includes('end_conversation')"
              @update:checked="() => handleFeatureFlag('end_conversation')"
            />
            <Label for="end_conversation">
              {{ $t('INBOX_MGMT.FEATURES.ALLOW_END_CONVERSATION') }}
            </Label>
          </div>
          <div v-if="isAWebWidgetInbox" class="flex gap-2 pb-4">
            <Checkbox
              :checked="
                selectedFeatureFlags.includes('use_inbox_avatar_for_bot')
              "
              @update:checked="
                () => handleFeatureFlag('use_inbox_avatar_for_bot')
              "
            />
            <Label for="use_inbox_avatar_for_bot">
              {{ $t('INBOX_MGMT.FEATURES.USE_INBOX_AVATAR_FOR_BOT') }}
            </Label>
          </div>
        </SettingsSection>
        <SettingsSection
          v-if="isAWebWidgetInbox || isAnEmailChannel"
          :title="$t('INBOX_MGMT.EDIT.SENDER_NAME_SECTION.TITLE')"
          :sub-title="$t('INBOX_MGMT.EDIT.SENDER_NAME_SECTION.SUB_TEXT')"
          :show-border="false"
        >
          <div class="pb-4">
            <SenderNameExamplePreview
              :sender-name-type="senderNameType"
              :business-name="businessName"
              @update="toggleSenderNameType"
            />
            <div class="flex flex-col gap-2 items-start mt-2">
              <Button variant="ghost" @click="onClickShowBusinessNameInput">
                {{
                  $t(
                    'INBOX_MGMT.EDIT.SENDER_NAME_SECTION.BUSINESS_NAME.BUTTON_TEXT'
                  )
                }}
              </Button>
              <div v-if="showBusinessNameInput" class="flex gap-2 w-[80%]">
                <Input
                  ref="businessNameInput"
                  v-model="businessName"
                  :placeholder="
                    $t(
                      'INBOX_MGMT.EDIT.SENDER_NAME_SECTION.BUSINESS_NAME.PLACEHOLDER'
                    )
                  "
                  class="mb-0"
                  type="text"
                />
                <Button class="flex-shrink-0" @click="updateInbox">
                  {{
                    $t(
                      'INBOX_MGMT.EDIT.SENDER_NAME_SECTION.BUSINESS_NAME.SAVE_BUTTON_TEXT'
                    )
                  }}
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>
        <SettingsSection :show-border="false">
          <Button
            v-if="isAPIInbox"
            type="submit"
            :disabled="v$.webhookUrl.$invalid || uiFlags.isUpdating"
            @click="updateInbox"
          >
            <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isUpdating">
              {{ $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE') }}
            </template>
          </Button>
          <Button
            v-else
            type="submit"
            :disabled="v$.$invalid || uiFlags.isUpdating"
            @click="updateInbox"
          >
            <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isUpdating">
              {{ $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE') }}
            </template>
          </Button>
        </SettingsSection>
      </div>

      <div v-if="selectedTabKey === 'collaborators'" class="mx-8">
        <CollaboratorsPage :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'configuration'">
        <ConfigurationPage :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'csat'">
        <CustomerSatisfactionPage :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'pre-chat-form'">
        <PreChatFormSettings :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'business-hours'">
        <WeeklyAvailability :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'widget-builder'">
        <WidgetBuilder :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'bot-configuration'">
        <BotConfiguration :inbox="inbox" />
      </div>
      <div v-if="selectedTabKey === 'whatsapp-health'">
        <AccountHealth :health-data="healthData" />
      </div>
    </section>
  </div>
</template>
