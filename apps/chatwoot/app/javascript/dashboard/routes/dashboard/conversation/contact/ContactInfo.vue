<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button component name */
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import {
  DuplicateContactException,
  ExceptionWithMessage,
} from 'shared/helpers/CustomErrors';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';
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
import ViewAllConversations from './ViewAllConversations.vue';
import Avatar from 'next/avatar/Avatar.vue';
import SocialIcons from './SocialIcons.vue';
import EditContact from './EditContact.vue';
import ContactMergeModal from 'dashboard/modules/contact/ContactMergeModal.vue';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import VoiceCallButton from 'dashboard/components-next/Contacts/VoiceCallButton.vue';
import ContactClientBadges from '../Client/ContactClientBadges.vue';
import InlineInput from 'dashboard/components-next/inline-input/InlineInput.vue';

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
    ViewAllConversations,
    EditContact,
    Avatar,
    ComposeConversation,
    SocialIcons,
    ContactMergeModal,
    VoiceCallButton,
    ContactClientBadges,
    InlineInput,
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
      exactTimestamp: useExactTimestamp(),
      currentParams,
      currentRouteName,
      visit,
    };
  },
  data() {
    return {
      isEditingName: false,
      editName: '',
    };
  },
  computed: {
    ...mapGetters({
      uiFlags: 'contacts/getUIFlags',
      currentChat: 'getSelectedChat',
    }),
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

      const telegram = socialProfiles?.telegram || telegramUsername || '';
      const twitter = socialProfiles?.twitter || twitterScreenName || '';

      return {
        ...(socialProfiles || {}),
        twitter,
        telegram,
      };
    },
    whatsappUsername() {
      const username =
        this.socialProfiles.whatsapp ||
        this.additionalAttributes.social_whatsapp_user_name ||
        '';

      return username.toString().replace(/^@+/, '');
    },
    formattedWhatsappUsername() {
      return this.whatsappUsername ? `@${this.whatsappUsername}` : '';
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
        } else if (this.currentRouteName !== 'contacts_dashboard_index') {
          this.visit({
            name: 'contacts_dashboard_index',
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
    startEditingName() {
      this.editName = this.contact.name || '';
      this.isEditingName = true;
      this.$nextTick(() => {
        this.$refs.nameInput?.focus();
      });
    },
    saveNameEdit() {
      if (!this.isEditingName) return;
      this.isEditingName = false;
      const trimmed = this.editName.trim();
      if (trimmed && trimmed !== this.contact.name) {
        this.updateContactField({ name: trimmed });
      }
    },
    cancelNameEdit() {
      this.isEditingName = false;
    },
    onFieldUpdate(field, value) {
      this.updateContactField({ [field]: value });
    },
    async updateContactField(attrs) {
      const contactId = this.contact.id;
      try {
        await this.$store.dispatch('contacts/update', {
          id: contactId,
          ...attrs,
        });
        useAlert(this.$t('CONTACT_FORM.SUCCESS_MESSAGE'));
        await this.$store.dispatch('contacts/fetchContactableInbox', contactId);
      } catch (error) {
        if (error instanceof DuplicateContactException) {
          const detail = error.contactErrorDetail;
          if (detail) {
            useAlert(detail);
          } else {
            const invalidAttrs = Array.isArray(error.data) ? error.data : [];
            if (invalidAttrs.includes('email')) {
              useAlert(this.$t('CONTACT_FORM.FORM.EMAIL_ADDRESS.DUPLICATE'));
            } else if (invalidAttrs.includes('phone_number')) {
              useAlert(this.$t('CONTACT_FORM.FORM.PHONE_NUMBER.DUPLICATE'));
            } else {
              useAlert(this.$t('CONTACT_FORM.ERROR_MESSAGE'));
            }
          }
        } else if (error instanceof ExceptionWithMessage) {
          useAlert(error.data);
        } else {
          useAlert(error.message || this.$t('CONTACT_FORM.ERROR_MESSAGE'));
        }
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
          <div class="group/name flex items-center min-w-0 gap-2">
            <InlineInput
              v-if="isEditingName"
              ref="nameInput"
              v-model="editName"
              custom-input-class="!text-lg !font-semibold !w-auto max-w-full [field-sizing:content]"
              class="!w-fit min-w-0"
              @enter-press="saveNameEdit"
              @escape-press="cancelNameEdit"
              @blur="saveNameEdit"
            />
            <h3
              v-else
              class="flex-shrink max-w-full min-w-0 my-0 text-lg font-semibold capitalize break-words text-n-slate-12 cursor-pointer hover:text-n-slate-12/80"
              :title="$t('CONTACT_PANEL.CLICK_TO_EDIT')"
              @click="startEditingName"
            >
              {{ contact.name }}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              :title="$t('CONTACT_PANEL.CLICK_TO_EDIT')"
              class="flex-shrink-0 -mx-1 opacity-0 transition-opacity"
              :class="
                isEditingName
                  ? 'invisible'
                  : 'group-hover/name:opacity-100 focus-visible:opacity-100'
              "
              @click="startEditingName"
            >
              <Icon icon="i-lucide-pencil" />
            </Button>
          </div>
          <div class="flex flex-row items-center gap-2">
            <span
              v-if="contact.created_at"
              v-tooltip.left="
                `${$t('CONTACT_PANEL.CREATED_AT_LABEL')} ${exactTimestamp(
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
            editable
            @update="value => onFieldUpdate('email', value)"
          />
          <ContactInfoRow
            :href="contact.phone_number ? `tel:${contact.phone_number}` : ''"
            :value="contact.phone_number"
            icon="call"
            emoji="📞"
            :title="$t('CONTACT_PANEL.PHONE_NUMBER')"
            show-copy
            editable
            @update="value => onFieldUpdate('phone_number', value)"
          />
          <ContactInfoRow
            v-if="formattedWhatsappUsername"
            :value="formattedWhatsappUsername"
            icon="brand-whatsapp"
            emoji="💬"
            :title="$t('CONTACT_PANEL.WHATSAPP_USERNAME')"
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
            editable
            @update="
              value =>
                updateContactField({
                  additional_attributes: {
                    ...additionalAttributes,
                    company_name: value,
                  },
                })
            "
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
          <template #trigger>
            <Button
              v-tooltip.top-end="$t('CONTACT_PANEL.NEW_MESSAGE')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-ph-chat-circle-dots" />
            </Button>
          </template>
        </ComposeConversation>
        <ViewAllConversations :contact="contact" />
        <VoiceCallButton
          :phone="contact.phone_number"
          :contact-id="contact.id"
          :conversation-id="currentChat?.id"
          icon="i-lucide-phone"
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
