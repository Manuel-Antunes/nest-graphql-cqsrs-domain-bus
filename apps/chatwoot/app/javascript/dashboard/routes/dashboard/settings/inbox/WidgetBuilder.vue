<script setup>
import { ref, computed, onMounted } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import Widget from 'dashboard/modules/widget-preview/components/Widget.vue';
import InputRadioGroup from './components/InputRadioGroup.vue';
import { LOCAL_STORAGE_KEYS } from 'dashboard/constants/localStorage';
import { LocalStorage } from 'shared/helpers/localStorage';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Avatar from 'next/avatar/Avatar.vue';
import Editor from 'dashboard/components-next/Editor/Editor.vue';
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  inbox: {
    type: Object,
    default: () => ({}),
  },
});

const { t } = useI18n();
const store = useStore();
const uiFlags = useMapGetter('inboxes/getUIFlags');

const validationSchema = toTypedSchema(
  z.object({
    websiteName: z
      .string()
      .min(
        1,
        t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WEBSITE_NAME.ERROR')
      ),
    welcomeHeading: z.string().optional(),
    welcomeTagline: z.string().optional(),
    replyTime: z.string(),
    color: z.string(),
  })
);

// useForm (not <Form>) so the live preview column can read `values` template-wide.
const { handleSubmit, values, meta } = useForm({
  validationSchema,
  initialValues: {
    websiteName: props.inbox.name ?? '',
    welcomeHeading: props.inbox.welcome_title ?? '',
    welcomeTagline: props.inbox.welcome_tagline ?? '',
    replyTime: props.inbox.reply_time ?? 'in_a_few_minutes',
    color: props.inbox.widget_color ?? '#1f93ff',
  },
});

// Local (upload / localStorage) state that isn't part of validation.
const isWidgetPreview = ref(true);
const avatarFile = ref(null);
const avatarUrl = ref(props.inbox.avatar_url ?? '');
const widgetBubblePosition = ref('right');
const widgetBubbleLauncherTitle = ref(
  t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_LAUNCHER_TITLE.DEFAULT')
);
const widgetBubbleType = ref('standard');

const widgetBubblePositions = ref([
  {
    id: 'left',
    title: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_POSITION.LEFT'),
    checked: false,
  },
  {
    id: 'right',
    title: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_POSITION.RIGHT'),
    checked: true,
  },
]);
const widgetBubbleTypes = ref([
  {
    id: 'standard',
    title: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_TYPE.STANDARD'),
    checked: true,
  },
  {
    id: 'expanded_bubble',
    title: t(
      'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_TYPE.EXPANDED_BUBBLE'
    ),
    checked: false,
  },
]);

const storageKey = computed(
  () => `${LOCAL_STORAGE_KEYS.WIDGET_BUILDER}${props.inbox.id}`
);

const widgetScript = computed(() => {
  const options = {
    position: widgetBubblePosition.value,
    type: widgetBubbleType.value,
    launcherTitle: widgetBubbleLauncherTitle.value,
  };
  const script = props.inbox.web_widget_script;
  return (
    script.substring(0, 13) +
    t('INBOX_MGMT.WIDGET_BUILDER.SCRIPT_SETTINGS', {
      options: JSON.stringify(options),
    }) +
    script.substring(13)
  );
});

const getWidgetViewOptions = computed(() => [
  {
    id: 'preview',
    title: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_VIEW_OPTION.PREVIEW'),
    checked: true,
  },
  {
    id: 'script',
    title: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_VIEW_OPTION.SCRIPT'),
    checked: false,
  },
]);

const getReplyTimeOptions = computed(() => [
  {
    key: 'in_a_few_minutes',
    value: 'in_a_few_minutes',
    text: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.REPLY_TIME.IN_A_FEW_MINUTES'),
  },
  {
    key: 'in_a_few_hours',
    value: 'in_a_few_hours',
    text: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.REPLY_TIME.IN_A_FEW_HOURS'),
  },
  {
    key: 'in_a_day',
    value: 'in_a_day',
    text: t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.REPLY_TIME.IN_A_DAY'),
  },
]);

onMounted(() => {
  const savedInformation = LocalStorage.get(storageKey.value);
  if (savedInformation) {
    widgetBubblePositions.value = widgetBubblePositions.value.map(item => {
      if (item.id === savedInformation.position) {
        item.checked = true;
        widgetBubblePosition.value = item.id;
      }
      return item;
    });
    widgetBubbleTypes.value = widgetBubbleTypes.value.map(item => {
      if (item.id === savedInformation.type) {
        item.checked = true;
        widgetBubbleType.value = item.id;
      }
      return item;
    });
    widgetBubbleLauncherTitle.value =
      savedInformation.launcherTitle || 'Chat with us';
  }
});

const handleWidgetBubblePositionChange = item => {
  widgetBubblePosition.value = item.id;
};
const handleWidgetBubbleTypeChange = item => {
  widgetBubbleType.value = item.id;
};
const handleWidgetViewChange = item => {
  isWidgetPreview.value = item.id === 'preview';
};
const handleImageUpload = ({ file, url }) => {
  avatarFile.value = file;
  avatarUrl.value = url;
};
const handleAvatarDelete = async () => {
  try {
    await store.dispatch('inboxes/deleteInboxAvatar', props.inbox.id);
    avatarFile.value = null;
    avatarUrl.value = '';
    useAlert(
      t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.AVATAR.DELETE.API.SUCCESS_MESSAGE')
    );
  } catch (error) {
    useAlert(
      error.message ||
        t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.AVATAR.DELETE.API.ERROR_MESSAGE')
    );
  }
};

const updateWidget = handleSubmit(async formValues => {
  const bubbleSettings = {
    position: widgetBubblePosition.value,
    launcherTitle: widgetBubbleLauncherTitle.value,
    type: widgetBubbleType.value,
  };
  LocalStorage.set(storageKey.value, bubbleSettings);

  try {
    const payload = {
      id: props.inbox.id,
      name: formValues.websiteName,
      channel: {
        widget_color: formValues.color,
        welcome_title: formValues.welcomeHeading,
        welcome_tagline: formValues.welcomeTagline,
        reply_time: formValues.replyTime,
      },
    };
    if (avatarFile.value) {
      payload.avatar = avatarFile.value;
    }
    await store.dispatch('inboxes/updateInbox', payload);
    useAlert(
      t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.UPDATE.API.SUCCESS_MESSAGE')
    );
  } catch (error) {
    useAlert(
      error.message ||
        t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.UPDATE.API.ERROR_MESSAGE')
    );
  }
});
</script>

<template>
  <div class="mx-8">
    <div class="flex p-2.5">
      <div class="w-100 lg:w-[40%]">
        <div class="min-h-full py-4 overflow-y-scroll px-px">
          <form class="flex flex-col gap-4" @submit.prevent="updateWidget">
            <div class="flex flex-col mb-4 items-start gap-1 w-full">
              <label class="mb-0.5 text-sm font-medium text-n-slate-12">
                {{ $t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.AVATAR.LABEL') }}
              </label>
              <Avatar
                :src="avatarUrl"
                :size="72"
                icon-name="i-ri-global-fill"
                name=""
                allow-upload
                rounded-full
                @upload="handleImageUpload"
                @delete="handleAvatarDelete"
              />
            </div>

            <FormField v-slot="{ componentField }" name="websiteName">
              <FormItem class="w-full">
                <FormLabel>
                  {{
                    $t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WEBSITE_NAME.LABEL')
                  }}
                </FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    :placeholder="
                      $t(
                        'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WEBSITE_NAME.PLACE_HOLDER'
                      )
                    "
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="welcomeHeading">
              <FormItem class="w-full">
                <FormLabel>
                  {{
                    $t(
                      'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WELCOME_HEADING.LABEL'
                    )
                  }}
                </FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    :placeholder="
                      $t(
                        'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WELCOME_HEADING.PLACE_HOLDER'
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
                        'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WELCOME_TAGLINE.LABEL'
                      )
                    "
                    :placeholder="
                      $t(
                        'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WELCOME_TAGLINE.PLACE_HOLDER'
                      )
                    "
                    :max-length="255"
                    channel-type="Context::InboxSettings"
                    @update:model-value="handleChange"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="replyTime">
              <FormItem class="w-full">
                <FormLabel>
                  {{
                    $t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.REPLY_TIME.LABEL')
                  }}
                </FormLabel>
                <Select v-bind="componentField">
                  <FormControl>
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem
                      v-for="option in getReplyTimeOptions"
                      :key="option.key"
                      :value="option.value"
                    >
                      {{ option.text }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="color">
              <FormItem class="w-full">
                <FormLabel>
                  {{
                    $t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_COLOR_LABEL')
                  }}
                </FormLabel>
                <FormControl>
                  <ColorPicker v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <InputRadioGroup
              name="widget-bubble-position"
              :label="
                $t(
                  'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_POSITION_LABEL'
                )
              "
              :items="widgetBubblePositions"
              :action="handleWidgetBubblePositionChange"
            />
            <InputRadioGroup
              name="widget-bubble-type"
              :label="
                $t(
                  'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_TYPE_LABEL'
                )
              "
              :items="widgetBubbleTypes"
              :action="handleWidgetBubbleTypeChange"
            />
            <div class="flex flex-col gap-1">
              <Label>
                {{
                  $t(
                    'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_LAUNCHER_TITLE.LABEL'
                  )
                }}
              </Label>
              <Input
                v-model="widgetBubbleLauncherTitle"
                :placeholder="
                  $t(
                    'INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.WIDGET_BUBBLE_LAUNCHER_TITLE.PLACE_HOLDER'
                  )
                "
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              :disabled="!meta.valid || uiFlags.isUpdating"
            >
              <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
              <template v-if="!uiFlags.isUpdating">
                {{
                  $t('INBOX_MGMT.WIDGET_BUILDER.WIDGET_OPTIONS.UPDATE.BUTTON_TEXT')
                }}
              </template>
            </Button>
          </form>
        </div>
      </div>
      <div class="w-100 lg:w-3/5">
        <InputRadioGroup
          name="widget-view-options"
          class="text-center"
          :items="getWidgetViewOptions"
          :action="handleWidgetViewChange"
        />
        <div
          v-if="isWidgetPreview"
          class="flex flex-col items-center justify-end min-h-[40.625rem] mx-5 mb-5 p-2.5 bg-n-slate-3 rounded-lg"
        >
          <Widget
            :welcome-heading="values.welcomeHeading"
            :welcome-tagline="values.welcomeTagline"
            :website-name="values.websiteName"
            :logo="avatarUrl"
            is-online
            :reply-time="values.replyTime"
            :color="values.color"
            :widget-bubble-position="widgetBubblePosition"
            :widget-bubble-launcher-title="widgetBubbleLauncherTitle"
            :widget-bubble-type="widgetBubbleType"
          />
        </div>
        <div
          v-else
          class="mx-5 p-2.5 bg-n-slate-3 rounded-lg dark:bg-n-solid-3"
        >
          <woot-code :script="widgetScript" />
        </div>
      </div>
    </div>
  </div>
</template>
