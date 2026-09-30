<script setup>
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';

import PageHeader from '../../SettingsSubPageHeader.vue';
import GreetingsEditor from 'shared/components/GreetingsEditor.vue';
import Editor from 'dashboard/components-next/Editor/Editor.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Switch } from 'dashboard/components-next/ui/switch';
import { Label } from 'dashboard/components-next/ui/label';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const { t } = useI18n();
const store = useStore();
const { visit } = useAppNavigation();

const uiFlags = useMapGetter('inboxes/getUIFlags');

const validationSchema = toTypedSchema(
  z.object({
    inboxName: z.string().min(1, t('INBOX_MGMT.ADD.WEBSITE_NAME.ERROR')),
    channelWebsiteUrl: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_DOMAIN.ERROR')),
    widgetColor: z.string(),
    welcomeTitle: z.string().optional(),
    welcomeTagline: z.string().optional(),
    greetingEnabled: z.boolean(),
    greetingMessage: z.string().optional(),
  })
);

const initialValues = {
  inboxName: '',
  channelWebsiteUrl: '',
  widgetColor: '#009CE0',
  welcomeTitle: '',
  welcomeTagline: '',
  greetingEnabled: false,
  greetingMessage: '',
};

const createChannel = async values => {
  try {
    const website = await store.dispatch('inboxes/createWebsiteChannel', {
      name: values.inboxName?.trim(),
      greeting_enabled: values.greetingEnabled,
      greeting_message: values.greetingMessage || '',
      channel: {
        type: 'web_widget',
        website_url: values.channelWebsiteUrl,
        widget_color: values.widgetColor,
        welcome_title: values.welcomeTitle || '',
        welcome_tagline: values.welcomeTagline || '',
      },
    });
    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: website.id,
      },
    });
  } catch (error) {
    useAlert(
      error.message || t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <div class="h-full w-full min-w-0 p-6 col-span-6">
    <PageHeader
      :header-title="$t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.TITLE')"
      :header-content="$t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.DESC')"
    />
    <woot-loading-state
      v-if="uiFlags.isCreating"
      :message="$t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.LOADING_MESSAGE')"
    />
    <Form
      v-if="!uiFlags.isCreating"
      v-slot="{ values, meta }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-col gap-4 mx-0 w-full min-w-0"
      @submit="createChannel"
    >
      <FormField v-slot="{ componentField }" name="inboxName">
        <FormItem class="w-full">
          <FormLabel>{{ $t('INBOX_MGMT.ADD.WEBSITE_NAME.LABEL') }}</FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="$t('INBOX_MGMT.ADD.WEBSITE_NAME.PLACEHOLDER')"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="channelWebsiteUrl">
        <FormItem class="w-full">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_DOMAIN.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_DOMAIN.PLACEHOLDER')
              "
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="widgetColor">
        <FormItem class="w-full">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.WIDGET_COLOR.LABEL') }}
          </FormLabel>
          <FormControl>
            <ColorPicker v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="welcomeTitle">
        <FormItem class="w-full">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TITLE.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TITLE.PLACEHOLDER'
                )
              "
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ value, handleChange }" name="welcomeTagline">
        <FormItem class="w-full">
          <FormControl>
            <Editor
              :model-value="value || ''"
              :label="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TAGLINE.LABEL'
                )
              "
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_WELCOME_TAGLINE.PLACEHOLDER'
                )
              "
              :max-length="255"
              channel-type="Context::InboxSettings"
              @update:model-value="handleChange"
            />
          </FormControl>
        </FormItem>
      </FormField>

      <FormField v-slot="{ value, handleChange }" name="greetingEnabled">
        <FormItem class="w-full">
          <div class="flex items-center justify-between gap-2">
            <Label class="mb-0">
              {{
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_TOGGLE.LABEL')
              }}
            </Label>
            <FormControl>
              <Switch :model-value="value" @update:model-value="handleChange" />
            </FormControl>
          </div>
          <p class="help-text">
            {{
              $t(
                'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_TOGGLE.HELP_TEXT'
              )
            }}
          </p>
        </FormItem>
      </FormField>

      <FormField
        v-if="values.greetingEnabled"
        v-slot="{ value, handleChange }"
        name="greetingMessage"
      >
        <FormItem class="w-full">
          <FormControl>
            <GreetingsEditor
              :model-value="value || ''"
              class="w-full"
              :label="
                $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_MESSAGE.LABEL')
              "
              :placeholder="
                $t(
                  'INBOX_MGMT.ADD.WEBSITE_CHANNEL.CHANNEL_GREETING_MESSAGE.PLACEHOLDER'
                )
              "
              richtext
              @update:model-value="handleChange"
            />
          </FormControl>
        </FormItem>
      </FormField>

      <div class="flex flex-row justify-end w-full gap-2 px-0 py-2 mt-4">
        <div class="w-full">
          <Button
            type="submit"
            variant="default"
            :disabled="!meta.valid || uiFlags.isCreating"
          >
            <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isCreating">
              {{ $t('INBOX_MGMT.ADD.WEBSITE_CHANNEL.SUBMIT_BUTTON') }}
            </template>
          </Button>
        </div>
      </div>
    </Form>
  </div>
</template>
