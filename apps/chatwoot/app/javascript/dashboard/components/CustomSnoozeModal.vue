<script>
import DatePicker from 'vue-datepicker-next';
import { Button } from 'dashboard/components-next/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from 'dashboard/components-next/ui/dialog';

export default {
  components: {
    DatePicker,
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  },
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close', 'chooseTime'],

  data() {
    return {
      snoozeTime: null,
      lang: {
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        yearFormat: 'YYYY',
        monthFormat: 'MMMM',
      },
    };
  },

  methods: {
    onClose() {
      this.$emit('close');
    },
    chooseTime() {
      this.$emit('chooseTime', this.snoozeTime);
    },
    disabledDate(date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return date < yesterday;
    },
    disabledTime(date) {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      return date < now;
    },
  },
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) $emit('close');
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('CONVERSATION.CUSTOM_SNOOZE.TITLE') }}</DialogTitle>
      </DialogHeader>
      <form class="w-full" @submit.prevent="chooseTime">
        <DatePicker
          v-model:value="snoozeTime"
          type="datetime"
          inline
          input-class="mx-input"
          :lang="lang"
          :disabled-date="disabledDate"
          :disabled-time="disabledTime"
        />
        <div class="flex flex-row justify-end w-full gap-2 px-0 py-2">
          <Button variant="outline" type="reset" @click.prevent="onClose">
            {{ $t('CONVERSATION.CUSTOM_SNOOZE.CANCEL') }}
          </Button>
          <Button type="submit">
            {{ $t('CONVERSATION.CUSTOM_SNOOZE.APPLY') }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
