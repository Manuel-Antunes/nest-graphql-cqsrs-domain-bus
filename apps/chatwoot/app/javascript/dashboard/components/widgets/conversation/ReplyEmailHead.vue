<script>
import { validEmailsByComma } from './helpers/emailHeadHelper';
import { useVuelidate } from '@vuelidate/core';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';

export default {
  components: {
    Button,
    Input,
  },
  props: {
    ccEmails: {
      type: String,
      default: '',
    },
    bccEmails: {
      type: String,
      default: '',
    },
    toEmails: {
      type: String,
      default: '',
    },
  },
  emits: ['update:bccEmails', 'update:ccEmails', 'update:toEmails'],
  setup() {
    return { v$: useVuelidate() };
  },
  data() {
    return {
      showBcc: false,
      ccEmailsVal: '',
      bccEmailsVal: '',
      toEmailsVal: '',
    };
  },
  watch: {
    bccEmails(newVal) {
      if (newVal !== this.bccEmailsVal) {
        this.bccEmailsVal = newVal;
      }
    },
    ccEmails(newVal) {
      if (newVal !== this.ccEmailsVal) {
        this.ccEmailsVal = newVal;
      }
    },
    toEmails(newVal) {
      if (newVal !== this.toEmailsVal) {
        this.toEmailsVal = newVal;
      }
    },
  },
  mounted() {
    this.ccEmailsVal = this.ccEmails;
    this.bccEmailsVal = this.bccEmails;
    this.toEmailsVal = this.toEmails;
  },
  validations: {
    ccEmailsVal: {
      hasValidEmails(value) {
        return validEmailsByComma(value);
      },
    },
    bccEmailsVal: {
      hasValidEmails(value) {
        return validEmailsByComma(value);
      },
    },
    toEmailsVal: {
      hasValidEmails(value) {
        return validEmailsByComma(value);
      },
    },
  },
  methods: {
    handleAddBcc() {
      this.showBcc = true;
    },
    onBlur() {
      this.v$.$touch();
      this.$emit('update:bccEmails', this.bccEmailsVal);
      this.$emit('update:ccEmails', this.ccEmailsVal);
      this.$emit('update:toEmails', this.toEmailsVal);
    },
  },
};
</script>

<template>
  <div>
    <div
      v-if="toEmails"
      class="flex flex-col w-full border-b p-2"
      :class="v$.toEmailsVal.$error ? 'border-destructive' : 'border-border'"
    >
      <div class="flex flex-row w-full items-center gap-2">
        <label
          class="text-xs font-semibold"
          :class="v$.toEmailsVal.$error && 'text-destructive'"
        >
          {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.TO') }}
        </label>
        <div class="flex-1 min-w-0 m-0 rounded-none whitespace-nowrap">
          <Input
            v-model="v$.toEmailsVal.$model"
            type="text"
            class="!mb-0 border-transparent !outline-none h-8 !text-sm !border-0 border-none !bg-transparent dark:!bg-transparent shadow-none"
            :placeholder="$t('CONVERSATION.REPLYBOX.EMAIL_HEAD.CC.PLACEHOLDER')"
            @blur="onBlur"
          />
        </div>
      </div>
    </div>
    <div
      class="flex flex-col w-full border-b p-2"
      :class="v$.ccEmailsVal.$error ? 'border-destructive' : 'border-border'"
    >
      <div class="flex flex-row w-full items-center gap-2">
        <label
          class="text-xs font-semibold"
          :class="v$.ccEmailsVal.$error && 'text-destructive'"
        >
          {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.CC.LABEL') }}
        </label>
        <div class="flex-1 min-w-0 m-0 rounded-none whitespace-nowrap">
          <Input
            v-model="v$.ccEmailsVal.$model"
            class="!mb-0 border-transparent !outline-none h-8 !text-sm !border-0 border-none !bg-transparent dark:!bg-transparent shadow-none"
            type="text"
            :placeholder="$t('CONVERSATION.REPLYBOX.EMAIL_HEAD.CC.PLACEHOLDER')"
            @blur="onBlur"
          />
        </div>
        <Button v-if="!showBcc" variant="outline" @click="handleAddBcc">
          {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.ADD_BCC') }}
        </Button>
      </div>
      <span v-if="v$.ccEmailsVal.$error" class="text-sm text-destructive">
        {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.CC.ERROR') }}
      </span>
    </div>
    <div
      v-if="showBcc"
      class="flex flex-col w-full border-b p-2"
      :class="v$.bccEmailsVal.$error ? 'border-destructive' : 'border-border'"
    >
      <div class="flex flex-row w-full items-center gap-2">
        <label
          class="text-xs font-semibold"
          :class="v$.bccEmailsVal.$error && 'text-destructive'"
        >
          {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.BCC.LABEL') }}
        </label>
        <div class="flex-1 min-w-0 m-0 rounded-none whitespace-nowrap">
          <Input
            v-model="v$.bccEmailsVal.$model"
            type="text"
            class="!mb-0 border-transparent !outline-none h-8 !text-sm !border-0 border-none !bg-transparent dark:!bg-transparent shadow-none"
            :placeholder="
              $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.BCC.PLACEHOLDER')
            "
            @blur="onBlur"
          />
        </div>
      </div>
      <span v-if="v$.bccEmailsVal.$error" class="text-sm text-destructive">
        {{ $t('CONVERSATION.REPLYBOX.EMAIL_HEAD.BCC.ERROR') }}
      </span>
    </div>
  </div>
</template>
