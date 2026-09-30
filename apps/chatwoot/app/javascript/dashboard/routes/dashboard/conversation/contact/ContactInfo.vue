<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button component name */
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { dynamicTime } from 'shared/helpers/timeHelper';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';
import { useAdmin } from 'dashboard/composables/useAdmin';
import ContactInfoRow from './ContactInfoRow.vue';
import Avatar from 'next/avatar/Avatar.vue';
import SocialIcons from './SocialIcons.vue';
import EditContact from './EditContact.vue';
import ContactMergeModal from 'dashboard/modules/contact/ContactMergeModal.vue';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import VoiceCallButton from 'dashboard/components-next/Contacts/VoiceCallButton.vue';
import ContactClientBadges from '../Client/ContactClientBadges.vue';

import {
  isAConversationRoute,
  isAInboxViewRoute,
  getConversationDashboardRoute,
} from '../../../../helper/routeHelpers';

export default {
  components: {
    Button,
    Icon,
    ContactInfoRow,
    EditContact,
    Avatar,
    ComposeConversation,
    SocialIcons,
    ContactMergeModal,
    VoiceCallButton,
    ContactClientBadges,
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
  },
  props: {
    contact: {
      type: Object,
      default: () => ({}),
    },
    showAvatar: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['panelClose'],
  setup() {
    const { isAdmin } = useAdmin();
    const { currentParams, currentRouteName, visit } = useAppNavigation();
    return {
      isAdmin,
      currentParams,
      currentRouteName,
      visit,
    };
  },
  computed: {
    ...mapGetters({ uiFlags: 'contacts/getUIFlags' }),
    contactProfileLink() {
      return `/app/accounts/${this.currentParams.accountId}/contacts/${this.contact.id}`;
    },
    additionalAttributes() {
      return this.contact.additional_attributes || {};
    },
    location() {
      const {
        country = '',
        city = '',
        country_code: countryCode,
      } = this.additionalAttributes;
      const cityAndCountry = [city, country].filter(item => !!item).join(', ');

      if (!cityAndCountry) {
        return '';
      }
      return this.findCountryFlag(countryCode, cityAndCountry);
    },
    socialProfiles() {
      const {
        social_profiles: socialProfiles,
        screen_name: twitterScreenName,
        social_telegram_user_name: telegramUsername,
      } = this.additionalAttributes;
      return {
        twitter: twitterScreenName,
        telegram: telegramUsername,
        ...(socialProfiles || {}),
      };
    },
    // Delete Modal
    confirmDeleteMessage() {
      return ` ${this.contact.name}?`;
    },
  },
  watch: {
    'contact.id': {
      handler(id) {
        this.$store.dispatch('contacts/fetchContactableInbox', id);
      },
      immediate: true,
    },
  },
  methods: {
    dynamicTime,
    confirmDeletion() {
      this.deleteContact(this.contact);
    },
    findCountryFlag(countryCode, cityAndCountry) {
      try {
        if (!countryCode) {
          return `${cityAndCountry} 🌎`;
        }

        const code = countryCode?.toLowerCase();
        return `${cityAndCountry} <span class="fi fi-${code} size-3.5"></span>`;
      } catch (error) {
        return '';
      }
    },
    async deleteContact({ id }) {
      try {
        await this.$store.dispatch('contacts/delete', id);
        this.$emit('panelClose');
        useAlert(this.$t('DELETE_CONTACT.API.SUCCESS_MESSAGE'));

        if (isAConversationRoute(this.currentRouteName)) {
          this.visit({
            name: getConversationDashboardRoute(this.currentRouteName),
          });
        } else if (isAInboxViewRoute(this.currentRouteName)) {
          this.visit({
            name: 'inbox_view',
          });
        } else if (this.currentRouteName !== 'contacts_dashboard') {
          this.visit({
            name: 'contacts_dashboard',
          });
        }
      } catch (error) {
        useAlert(
          error.message
            ? error.message
            : this.$t('DELETE_CONTACT.API.ERROR_MESSAGE')
        );
      }
    },
  },
};
</script>

<template>
  <div class="relative items-center w-full p-4">
    <div class="flex flex-col items-center w-full gap-2 text-center">
      <div class="flex flex-row justify-center">
        <Avatar
          v-if="showAvatar"
          :src="contact.thumbnail"
          :name="contact.name"
          :status="contact.availability_status"
          :size="80"
          hide-offline-status
          rounded-full
        />
      </div>

      <div class="flex flex-col items-center gap-1.5 min-w-0 w-full">
        <div
          v-if="showAvatar"
          class="flex items-center justify-center w-full min-w-0 gap-3"
        >
          <h3
            class="flex-shrink max-w-full min-w-0 my-0 text-lg font-semibold capitalize break-words text-n-slate-12"
          >
            {{ contact.name }}
          </h3>
          <div class="flex flex-row items-center gap-2">
            <span
              v-if="contact.created_at"
              v-tooltip.left="
                `${$t('CONTACT_PANEL.CREATED_AT_LABEL')} ${dynamicTime(
                  contact.created_at
                )}`
              "
              class="i-lucide-info text-sm text-n-slate-10"
            />
            <a
              :href="contactProfileLink"
              target="_blank"
              rel="noopener nofollow noreferrer"
              class="leading-3"
            >
              <span class="i-lucide-external-link text-sm text-n-slate-10" />
            </a>
          </div>
        </div>
        <ContactClientBadges :contact="contact" />

        <p v-if="additionalAttributes.description" class="break-words mb-0.5">
          {{ additionalAttributes.description }}
        </p>
        <div
          class="flex flex-col items-center w-full gap-2 max-w-full [&>div]:w-auto [&>div]:max-w-full"
        >
          <ContactInfoRow
            :href="contact.email ? `mailto:${contact.email}` : ''"
            :value="contact.email"
            icon="mail"
            emoji="✉️"
            :title="$t('CONTACT_PANEL.EMAIL_ADDRESS')"
            show-copy
          />
          <ContactInfoRow
            :href="contact.phone_number ? `tel:${contact.phone_number}` : ''"
            :value="contact.phone_number"
            icon="call"
            emoji="📞"
            :title="$t('CONTACT_PANEL.PHONE_NUMBER')"
            show-copy
          />
          <ContactInfoRow
            v-if="contact.identifier"
            :value="contact.identifier"
            icon="contact-identify"
            emoji="🪪"
            :title="$t('CONTACT_PANEL.IDENTIFIER')"
          />
          <ContactInfoRow
            :value="additionalAttributes.company_name"
            icon="building-bank"
            emoji="🏢"
            :title="$t('CONTACT_PANEL.COMPANY')"
          />
          <ContactInfoRow
            v-if="location || additionalAttributes.location"
            :value="location || additionalAttributes.location"
            icon="map"
            emoji="🌍"
            :title="$t('CONTACT_PANEL.LOCATION')"
          />
          <SocialIcons :social-profiles="socialProfiles" />
        </div>
      </div>
      <div class="flex items-center justify-center w-full mt-0.5 gap-2">
        <ComposeConversation :contact-id="String(contact.id)" is-modal>
          <template #trigger="{ toggle }">
            <Button
              v-tooltip.top-end="$t('CONTACT_PANEL.NEW_MESSAGE')"
              variant="outline"
              size="icon"
              @click="toggle"
            >
              <Icon icon="i-ph-chat-circle-dots" />
            </Button>
          </template>
        </ComposeConversation>
        <VoiceCallButton
          :phone="contact.phone_number"
          :contact-id="contact.id"
          icon="i-ri-phone-fill"
          size="sm"
          :tooltip-label="$t('CONTACT_PANEL.CALL')"
          slate
          faded
        />
        <EditContact :contact="contact">
          <template #trigger>
            <Button
              v-tooltip.top-end="$t('EDIT_CONTACT.BUTTON_LABEL')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-ph-pencil-simple" />
            </Button>
          </template>
        </EditContact>
        <ContactMergeModal :primary-contact="contact">
          <template #trigger>
            <Button
              v-tooltip.top-end="$t('CONTACT_PANEL.MERGE_CONTACT')"
              variant="outline"
              size="icon"
              :disabled="uiFlags.isMerging"
            >
              <Icon icon="i-ph-arrows-merge" />
            </Button>
          </template>
        </ContactMergeModal>
        <AlertDialog v-if="isAdmin">
          <AlertDialogTrigger as-child>
            <Button
              v-tooltip.top-end="$t('DELETE_CONTACT.BUTTON_LABEL')"
              variant="destructive"
              size="icon"
              :disabled="uiFlags.isDeleting"
            >
              <Icon icon="i-ph-trash" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {{ $t('DELETE_CONTACT.CONFIRM.TITLE') }}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {{ $t('DELETE_CONTACT.CONFIRM.MESSAGE') }}
                {{ confirmDeleteMessage }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {{ $t('DELETE_CONTACT.CONFIRM.NO') }}
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" @click="confirmDeletion">
                {{ $t('DELETE_CONTACT.CONFIRM.YES') }}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  </div>
</template>
