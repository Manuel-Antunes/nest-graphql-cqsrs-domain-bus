<script>
import { useVuelidate } from '@vuelidate/core';
import { required, minLength, email } from '@vuelidate/validators';
import { useAlert } from 'dashboard/composables';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';

export default {
  components: {
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  },
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    currentChat: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ['cancel', 'update:show'],
  setup() {
    return { v$: useVuelidate() };
  },
  data() {
    return {
      email: '',
      selectedType: '',
      isSubmitting: false,
    };
  },
  validations: {
    email: {
      required,
      email,
      minLength: minLength(4),
    },
  },
  computed: {
    localShow: {
      get() {
        return this.show;
      },
      set(value) {
        this.$emit('update:show', value);
      },
    },
    sentToOtherEmailAddress() {
      return this.selectedType === 'other_email_address';
    },
    isFormValid() {
      if (this.selectedType) {
        if (this.sentToOtherEmailAddress) {
          return !!this.email && !this.v$.email.$error;
        }
        return true;
      }
      return false;
    },
    selectedEmailAddress() {
      const { meta } = this.currentChat;
      switch (this.selectedType) {
        case 'contact':
          return meta.sender.email;
        case 'assignee':
          return meta.assignee.email;
        case 'other_email_address':
          return this.email;
        default:
          return '';
      }
    },
  },
  methods: {
    onCancel() {
      this.$emit('cancel');
    },
    async onSubmit() {
      this.isSubmitting = false;
      try {
        await this.$store.dispatch('sendEmailTranscript', {
          email: this.selectedEmailAddress,
          conversationId: this.currentChat.id,
        });
        useAlert(this.$t('EMAIL_TRANSCRIPT.SEND_EMAIL_SUCCESS'));
        this.onCancel();
      } catch (error) {
        const status = error?.response?.status;
        if (status === 402) {
          useAlert(this.$t('EMAIL_TRANSCRIPT.SEND_EMAIL_PAYMENT_REQUIRED'));
        } else {
          useAlert(this.$t('EMAIL_TRANSCRIPT.SEND_EMAIL_ERROR'));
        }
      } finally {
        this.isSubmitting = false;
      }
    },
  },
};
</script>

<template>
  <Dialog
    :open="localShow"
    @update:open="
      val => {
        if (!val) {
          onCancel();
          localShow = false;
        }
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('EMAIL_TRANSCRIPT.TITLE') }}</DialogTitle>
        <DialogDescription>{{ $t('EMAIL_TRANSCRIPT.DESC') }}</DialogDescription>
      </DialogHeader>
      <form class="w-full" @submit.prevent="onSubmit">
        <div class="w-full">
          <div
            v-if="currentChat.meta.sender && currentChat.meta.sender.email"
            class="flex items-center gap-2"
          >
            <input
              id="contact"
              v-model="selectedType"
              type="radio"
              name="selectedType"
              value="contact"
            />
            <label for="contact">{{
              $t('EMAIL_TRANSCRIPT.FORM.SEND_TO_CONTACT')
            }}</label>
          </div>
          <div
            v-if="
              currentChat.meta.assignee &&
              currentChat.meta.assignee_type === 'User'
            "
            class="flex items-center gap-2"
          >
            <input
              id="assignee"
              v-model="selectedType"
              type="radio"
              name="selectedType"
              value="assignee"
            />
            <label for="assignee">{{
              $t('EMAIL_TRANSCRIPT.FORM.SEND_TO_AGENT')
            }}</label>
          </div>
          <div class="flex items-center gap-2">
            <input
              id="other_email_address"
              v-model="selectedType"
              type="radio"
              name="selectedType"
              value="other_email_address"
            />
            <label for="other_email_address">{{
              $t('EMAIL_TRANSCRIPT.FORM.SEND_TO_OTHER_EMAIL_ADDRESS')
            }}</label>
          </div>
          <div v-if="sentToOtherEmailAddress" class="w-[50%] mt-1">
            <label :class="{ error: v$.email.$error }">
              <Input
                v-model="email"
                type="text"
                :placeholder="$t('EMAIL_TRANSCRIPT.FORM.EMAIL.PLACEHOLDER')"
                @input="v$.email.$touch"
              />
              <span v-if="v$.email.$error" class="message">
                {{ $t('EMAIL_TRANSCRIPT.FORM.EMAIL.ERROR') }}
              </span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('EMAIL_TRANSCRIPT.CANCEL') }}
            </Button>
          </DialogClose>
          <Button type="submit" :disabled="!isFormValid">
            {{ $t('EMAIL_TRANSCRIPT.SUBMIT') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
