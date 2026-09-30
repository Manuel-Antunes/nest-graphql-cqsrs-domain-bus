<script>
import { required, minLength } from '@vuelidate/validators';
import { mapGetters } from 'vuex';
import { useVuelidate } from '@vuelidate/core';
import { useAlert } from 'dashboard/composables';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Spinner } from 'dashboard/components-next/ui/spinner';
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
    Spinner,
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
    hasAccounts: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['closeAccountCreateModal'],
  setup() {
    return { v$: useVuelidate() };
  },
  data() {
    return {
      accountName: '',
    };
  },
  validations() {
    return {
      accountName: {
        required,
        minLength: minLength(1),
      },
    };
  },
  computed: {
    ...mapGetters({
      uiFlags: 'agents/getUIFlags',
    }),
  },
  methods: {
    async addAccount() {
      try {
        const account_id = await this.$store.dispatch('accounts/create', {
          account_name: this.accountName,
        });
        this.$emit('closeAccountCreateModal');
        useAlert(this.$t('CREATE_ACCOUNT.API.SUCCESS_MESSAGE'));
        window.location = `/app/accounts/${account_id}/dashboard`;
      } catch (error) {
        if (error.response.status === 422) {
          useAlert(this.$t('CREATE_ACCOUNT.API.EXIST_MESSAGE'));
        } else {
          useAlert(this.$t('CREATE_ACCOUNT.API.ERROR_MESSAGE'));
        }
      }
    },
  },
};
</script>

<template>
  <Dialog
    :open="show"
    @update:open="
      val => {
        if (!val) {
          $emit('closeAccountCreateModal');
        }
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('CREATE_ACCOUNT.NEW_ACCOUNT') }}</DialogTitle>
        <DialogDescription>
          {{ $t('CREATE_ACCOUNT.SELECTOR_SUBTITLE') }}
        </DialogDescription>
      </DialogHeader>
      <div v-if="!hasAccounts" class="mx-8 mt-6 mb-0 text-sm">
        <div class="flex items-center rounded-md alert">
          <div class="ml-1 mr-3">
            <fluent-icon icon="warning" />
          </div>
          {{ $t('CREATE_ACCOUNT.NO_ACCOUNT_WARNING') }}
        </div>
      </div>

      <form class="flex flex-col w-full" @submit.prevent="addAccount">
        <div class="w-full">
          <label :class="{ error: v$.accountName.$error }">
            {{ $t('CREATE_ACCOUNT.FORM.NAME.LABEL') }}
            <Input
              v-model="accountName"
              type="text"
              :placeholder="$t('CREATE_ACCOUNT.FORM.NAME.PLACEHOLDER')"
              @input="v$.accountName.$touch"
            />
          </label>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button
              variant="outline"
              type="reset"
              @click.prevent="() => $emit('closeAccountCreateModal')"
            >
              {{ $t('CREATE_ACCOUNT.FORM.CANCEL') }}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            :disabled="
              v$.accountName.$invalid ||
              v$.accountName.$invalid ||
              uiFlags.isCreating
            "
          >
            <Spinner v-if="uiFlags.isCreating" class="mr-2 size-6" />
            {{ $t('CREATE_ACCOUNT.FORM.SUBMIT') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
