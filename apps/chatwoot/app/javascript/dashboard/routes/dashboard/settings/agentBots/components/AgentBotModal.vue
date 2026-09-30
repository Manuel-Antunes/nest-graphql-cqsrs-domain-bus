<script setup>
import { ref, computed, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import { useToggle } from '@vueuse/core';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Input } from 'dashboard/components-next/ui/input';
import { Textarea } from 'dashboard/components-next/ui/textarea';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { Form, FormField } from 'dashboard/components-next/ui/form';
import AccessToken from 'dashboard/routes/dashboard/settings/profile/AccessToken.vue';

const props = defineProps({
  type: {
    type: String,
    default: 'create',
    validator: value => ['create', 'edit'].includes(value),
  },
  selectedBot: {
    type: Object,
    default: () => ({}),
  },
});

const BOT_TYPES = {
  WEBHOOK: 'webhook',
  INNER_QUEUE: 'inner_queue',
};

const MODAL_TYPES = {
  CREATE: 'create',
  EDIT: 'edit',
};

const store = useStore();
const { t } = useI18n();
const isOpen = ref(false);
const uiFlags = useMapGetter('agentBots/getUIFlags');

const botForm = ref(null);
const botAvatar = ref(null);
const botAvatarUrl = ref('');

const [showAccessToken, toggleAccessToken] = useToggle();
const accessToken = ref('');
const botSecret = ref('');

const botTypeOptions = computed(() => [
  { value: BOT_TYPES.WEBHOOK, label: t('AGENT_BOTS.TYPES.WEBHOOK') },
  { value: BOT_TYPES.INNER_QUEUE, label: t('AGENT_BOTS.TYPES.INNER_QUEUE') },
]);

const botTypeLabel = botType =>
  botTypeOptions.value.find(option => option.value === botType)?.label ?? '';

const isValidUrl = value => {
  if (!value) return true;
  try {
    return Boolean(new URL(value));
  } catch (error) {
    return false;
  }
};

const validationSchema = toTypedSchema(
  z
    .object({
      botName: z.string().min(1, t('AGENT_BOTS.FORM.ERRORS.NAME')),
      botDescription: z.string().optional(),
      botType: z.string(),
      botUrl: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      // Only webhook bots deliver over HTTP — inner_queue bots publish to an
      // internal Redis channel, so the outgoing URL is irrelevant for them.
      if (data.botType === BOT_TYPES.WEBHOOK && !data.botUrl) {
        ctx.addIssue({
          path: ['botUrl'],
          code: z.ZodIssueCode.custom,
          message: t('AGENT_BOTS.FORM.ERRORS.URL'),
        });
      }
      if (data.botUrl && !isValidUrl(data.botUrl)) {
        ctx.addIssue({
          path: ['botUrl'],
          code: z.ZodIssueCode.custom,
          message: t('AGENT_BOTS.FORM.ERRORS.VALID_URL'),
        });
      }
    })
);

const buildValues = () => {
  const bot = props.selectedBot || {};
  if (Object.keys(bot).length) {
    return {
      botName: bot.name || '',
      botDescription: bot.description || '',
      botType: bot.bot_type || BOT_TYPES.WEBHOOK,
      botUrl: bot.outgoing_url || bot.bot_config?.webhook_url || '',
    };
  }
  return {
    botName: '',
    botDescription: '',
    botType: BOT_TYPES.WEBHOOK,
    botUrl: '',
  };
};

// Reactive so the freshly-mounted <Form> reads the *current* selectedBot when
// the dialog opens in edit mode. A static const captured the empty create-mode
// values once at setup, so editing showed a blank form.
const initialValues = computed(() => buildValues());

// Force the vee-validate <Form> to remount whenever we switch bots (or
// create <-> edit) so it re-seeds from `initialValues` instead of keeping the
// values from the previous open.
const formKey = computed(
  () => `${props.type}-${props.selectedBot?.id ?? 'new'}`
);

const isLoading = computed(() =>
  props.type === MODAL_TYPES.CREATE
    ? uiFlags.value.isCreating
    : uiFlags.value.isUpdating
);

const dialogTitle = computed(() => {
  if (showAccessToken.value) {
    return t('AGENT_BOTS.ACCESS_TOKEN.TITLE');
  }
  return props.type === MODAL_TYPES.CREATE
    ? t('AGENT_BOTS.ADD.TITLE')
    : t('AGENT_BOTS.EDIT.TITLE');
});

const dialogDescription = computed(() => {
  if (showAccessToken.value) {
    return t('AGENT_BOTS.ACCESS_TOKEN.DESCRIPTION');
  }
  return '';
});

const confirmButtonLabel = computed(() =>
  props.type === MODAL_TYPES.CREATE
    ? t('AGENT_BOTS.FORM.CREATE')
    : t('AGENT_BOTS.FORM.UPDATE')
);

const showAccessTokenInput = computed(
  () =>
    showAccessToken.value ||
    props.type === MODAL_TYPES.EDIT ||
    accessToken.value
);

const handleImageUpload = ({ file, url: avatarUrl }) => {
  botAvatar.value = file;
  botAvatarUrl.value = avatarUrl;
};

const handleAvatarDelete = async () => {
  if (props.selectedBot?.id) {
    try {
      await store.dispatch(
        'agentBots/deleteAgentBotAvatar',
        props.selectedBot.id
      );
      botAvatar.value = null;
      botAvatarUrl.value = '';
      useAlert(t('AGENT_BOTS.AVATAR.SUCCESS_DELETE'));
    } catch (error) {
      useAlert(t('AGENT_BOTS.AVATAR.ERROR_DELETE'));
    }
  } else {
    botAvatar.value = null;
    botAvatarUrl.value = '';
  }
};

const handleSubmit = async values => {
  const botData = {
    name: values.botName,
    description: values.botDescription,
    outgoing_url: values.botType === BOT_TYPES.WEBHOOK ? values.botUrl : '',
    bot_type: values.botType,
    avatar: botAvatar.value,
  };

  const isCreate = props.type === MODAL_TYPES.CREATE;

  try {
    const actionPayload = isCreate
      ? botData
      : { id: props.selectedBot.id, data: botData };

    const response = await store.dispatch(
      `agentBots/${isCreate ? 'create' : 'update'}`,
      actionPayload
    );

    useAlert(
      isCreate
        ? t('AGENT_BOTS.ADD.API.SUCCESS_MESSAGE')
        : t('AGENT_BOTS.EDIT.API.SUCCESS_MESSAGE')
    );

    // Show access token and secret after creation
    if (isCreate) {
      const {
        access_token: responseAccessToken,
        secret: responseSecret,
        id,
      } = response || {};

      if (id && responseAccessToken) {
        accessToken.value = responseAccessToken;
        botSecret.value = responseSecret || '';
        toggleAccessToken(true);
      } else {
        accessToken.value = '';
        botSecret.value = '';
        isOpen.value = false;
      }
    } else {
      isOpen.value = false;
    }

    botForm.value?.resetForm();
    botAvatar.value = null;
    botAvatarUrl.value = '';
  } catch (error) {
    useAlert(
      isCreate
        ? t('AGENT_BOTS.ADD.API.ERROR_MESSAGE')
        : t('AGENT_BOTS.EDIT.API.ERROR_MESSAGE')
    );
  }
};

const syncFromSelectedBot = () => {
  const bot = props.selectedBot || {};
  botAvatarUrl.value = bot.thumbnail || '';
  if (props.type === MODAL_TYPES.EDIT) {
    if (bot.access_token) accessToken.value = bot.access_token;
    if (bot.secret) botSecret.value = bot.secret;
  }
  botForm.value?.setValues(buildValues());
};

const onCopyToken = async value => {
  await copyTextToClipboard(value);
  useAlert(t('AGENT_BOTS.ACCESS_TOKEN.COPY_SUCCESSFUL'));
};

const onCopySecret = async value => {
  await copyTextToClipboard(value || botSecret.value);
  useAlert(t('AGENT_BOTS.SECRET.COPY_SUCCESS'));
};

const onResetSecret = async () => {
  const response = await store.dispatch(
    'agentBots/resetSecret',
    props.selectedBot.id
  );
  if (response) {
    botSecret.value = response.secret;
    useAlert(t('AGENT_BOTS.SECRET.RESET_SUCCESS'));
  } else {
    useAlert(t('AGENT_BOTS.SECRET.RESET_ERROR'));
  }
};

const onResetToken = async () => {
  const response = await store.dispatch(
    'agentBots/resetAccessToken',
    props.selectedBot.id
  );
  if (response) {
    accessToken.value = response.access_token;
    useAlert(t('AGENT_BOTS.ACCESS_TOKEN.RESET_SUCCESS'));
  } else {
    useAlert(t('AGENT_BOTS.ACCESS_TOKEN.RESET_ERROR'));
  }
};

const closeModal = () => {
  accessToken.value = '';
  botSecret.value = '';
  toggleAccessToken(false);
};

const open = () => {
  isOpen.value = true;
};

const close = () => {
  closeModal();
  isOpen.value = false;
};

watch(() => props.selectedBot, syncFromSelectedBot, {
  immediate: true,
  deep: true,
});

defineExpose({ dialogRef: { open, close } });
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) {
          closeModal();
          isOpen = false;
        }
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription v-if="dialogDescription">
          {{ dialogDescription }}
        </DialogDescription>
      </DialogHeader>
      <Form
        :key="formKey"
        ref="botForm"
        v-slot="{ values, meta }"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col gap-4"
        @submit="handleSubmit"
      >
        <div
          v-if="!showAccessToken || type === MODAL_TYPES.EDIT"
          class="flex flex-col gap-4"
        >
          <div class="mb-2 flex flex-col items-start">
            <span class="mb-2 text-sm font-medium text-n-slate-12">
              {{ $t('AGENT_BOTS.FORM.AVATAR.LABEL') }}
            </span>
            <Avatar
              :src="botAvatarUrl"
              :name="values.botName"
              :size="68"
              allow-upload
              icon-name="i-lucide-bot-message-square"
              @upload="handleImageUpload"
              @delete="handleAvatarDelete"
            />
          </div>

          <FormField v-slot="{ componentField, errorMessage }" name="botName">
            <Input
              id="bot-name"
              v-bind="componentField"
              :label="$t('AGENT_BOTS.FORM.NAME.LABEL')"
              :placeholder="$t('AGENT_BOTS.FORM.NAME.PLACEHOLDER')"
              :message="errorMessage"
              :message-type="errorMessage ? 'error' : 'info'"
            />
          </FormField>

          <FormField v-slot="{ componentField }" name="botDescription">
            <Textarea
              id="bot-description"
              v-bind="componentField"
              :label="$t('AGENT_BOTS.FORM.DESCRIPTION.LABEL')"
              :placeholder="$t('AGENT_BOTS.FORM.DESCRIPTION.PLACEHOLDER')"
              class="max-h-20"
            />
          </FormField>

          <FormField v-slot="{ componentField }" name="botType">
            <div class="flex flex-col items-start gap-1">
              <span class="text-sm font-medium text-n-slate-12">
                {{ $t('AGENT_BOTS.FORM.BOT_TYPE.LABEL') }}
              </span>
              <Select v-bind="componentField">
                <SelectTrigger>
                  <SelectValue :placeholder="botTypeLabel(values.botType)" />
                </SelectTrigger>
                <SelectContent side="bottom" align="end" :side-offset="4">
                  <SelectItem
                    v-for="option in botTypeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span class="text-xs text-n-slate-11">
                {{ $t('AGENT_BOTS.FORM.BOT_TYPE.HELP') }}
              </span>
            </div>
          </FormField>

          <FormField
            v-if="values.botType === BOT_TYPES.WEBHOOK"
            v-slot="{ componentField, errorMessage }"
            name="botUrl"
          >
            <Input
              id="bot-url"
              v-bind="componentField"
              :label="$t('AGENT_BOTS.FORM.WEBHOOK_URL.LABEL')"
              :placeholder="$t('AGENT_BOTS.FORM.WEBHOOK_URL.PLACEHOLDER')"
              :message="errorMessage"
              :message-type="errorMessage ? 'error' : 'info'"
            />
          </FormField>
        </div>

        <div
          v-if="botSecret && type === MODAL_TYPES.EDIT"
          class="flex flex-col gap-1"
        >
          <label class="mb-0.5 text-sm font-medium text-n-slate-12">
            {{ $t('AGENT_BOTS.SECRET.LABEL') }}
          </label>
          <AccessToken
            :value="botSecret"
            @on-copy="onCopySecret"
            @on-reset="onResetSecret"
          />
        </div>

        <div v-if="showAccessTokenInput" class="flex flex-col gap-1">
          <label
            v-if="type === MODAL_TYPES.EDIT"
            class="mb-0.5 text-sm font-medium text-n-slate-12"
          >
            {{ $t('AGENT_BOTS.ACCESS_TOKEN.TITLE') }}
          </label>
          <AccessToken
            v-if="type === MODAL_TYPES.EDIT"
            :value="accessToken"
            @on-copy="onCopyToken"
            @on-reset="onResetToken"
          />
          <AccessToken
            v-else
            :value="accessToken"
            :show-reset-button="false"
            @on-copy="onCopyToken"
          />
        </div>

        <div
          v-if="botSecret && showAccessToken && type === MODAL_TYPES.CREATE"
          class="flex flex-col gap-1"
        >
          <p class="text-sm text-n-slate-11">
            {{ $t('AGENT_BOTS.SECRET.CREATED_DESC') }}
          </p>
          <label class="mb-0.5 text-sm font-medium text-n-slate-12">
            {{ $t('AGENT_BOTS.SECRET.LABEL') }}
          </label>
          <AccessToken
            :value="botSecret"
            :show-reset-button="false"
            @on-copy="onCopySecret"
          />
        </div>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('AGENT_BOTS.FORM.CANCEL') }}
            </Button>
          </DialogClose>
          <Button
            v-if="!showAccessToken"
            type="submit"
            data-testid="label-submit"
            :disabled="isLoading || !meta.valid"
          >
            <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
            <template v-if="!isLoading">{{ confirmButtonLabel }}</template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>
