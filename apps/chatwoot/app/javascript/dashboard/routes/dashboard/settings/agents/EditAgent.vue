<script setup>
import { computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Auth from '../../../../api/auth';
import wootConstants from 'dashboard/constants/globals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  id: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: '',
  },
  availability: {
    type: String,
    default: '',
  },
  provider: {
    type: String,
    default: '',
  },
  customRoleId: {
    type: Number,
    default: null,
  },
});

const emit = defineEmits(['close']);

const { AVAILABILITY_STATUS_KEYS } = wootConstants;

const store = useStore();
const { t } = useI18n();

const pageTitle = computed(
  () => `${t('AGENT_MGMT.EDIT.TITLE')} - ${props.name}`
);

const uiFlags = useMapGetter('agents/getUIFlags');
const getCustomRoles = useMapGetter('customRole/getCustomRoles');

const roles = computed(() => {
  const defaultRoles = [
    {
      id: 'administrator',
      name: 'administrator',
      label: t('AGENT_MGMT.AGENT_TYPES.ADMINISTRATOR'),
    },
    {
      id: 'agent',
      name: 'agent',
      label: t('AGENT_MGMT.AGENT_TYPES.AGENT'),
    },
  ];

  const customRoles = getCustomRoles.value.map(role => ({
    id: role.id,
    name: `custom_${role.id}`,
    label: role.name,
  }));

  return [...defaultRoles, ...customRoles];
});

const findRole = roleId =>
  roles.value.find(
    role => String(role.id) === String(roleId) || role.name === roleId
  );

const statusList = computed(() => {
  return [
    t('PROFILE_SETTINGS.FORM.AVAILABILITY.STATUS.ONLINE'),
    t('PROFILE_SETTINGS.FORM.AVAILABILITY.STATUS.BUSY'),
    t('PROFILE_SETTINGS.FORM.AVAILABILITY.STATUS.OFFLINE'),
  ];
});

const availabilityStatuses = computed(() =>
  statusList.value.map((statusLabel, index) => ({
    label: statusLabel,
    value: AVAILABILITY_STATUS_KEYS[index],
    disabled: props.availability === AVAILABILITY_STATUS_KEYS[index],
  }))
);

const validationSchema = toTypedSchema(
  z.object({
    agentName: z.string().min(1, t('AGENT_MGMT.EDIT.FORM.NAME.ERROR')),
    selectedRoleId: z
      .string()
      .min(1, t('AGENT_MGMT.EDIT.FORM.AGENT_TYPE.ERROR')),
    agentAvailability: z
      .string()
      .min(1, t('AGENT_MGMT.EDIT.FORM.AGENT_AVAILABILITY.ERROR')),
  })
);

const initialValues = {
  agentName: props.name,
  selectedRoleId:
    props.customRoleId != null ? String(props.customRoleId) : props.type,
  agentAvailability: props.availability,
};

const editAgent = async values => {
  try {
    const role = findRole(values.selectedRoleId);
    const payload = {
      id: props.id,
      name: values.agentName,
      availability: values.agentAvailability,
    };

    if (role?.name.startsWith('custom_')) {
      payload.custom_role_id = role.id;
    } else {
      payload.role = role?.name;
      payload.custom_role_id = null;
    }

    await store.dispatch('agents/update', payload);
    useAlert(t('AGENT_MGMT.EDIT.API.SUCCESS_MESSAGE'));
    emit('close');
  } catch (error) {
    useAlert(t('AGENT_MGMT.EDIT.API.ERROR_MESSAGE'));
  }
};

const resetPassword = async () => {
  try {
    await Auth.resetPassword({ email: props.email });
    useAlert(t('AGENT_MGMT.EDIT.PASSWORD_RESET.ADMIN_SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('AGENT_MGMT.EDIT.PASSWORD_RESET.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) emit('close');
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ pageTitle }}</DialogTitle>
      </DialogHeader>
      <Form
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="w-full flex flex-col gap-4"
        @submit="editAgent"
      >
        <FormField v-slot="{ componentField }" name="agentName">
          <FormItem class="w-full">
            <FormLabel>{{ $t('AGENT_MGMT.EDIT.FORM.NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="text"
                :placeholder="$t('AGENT_MGMT.EDIT.FORM.NAME.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="selectedRoleId">
          <FormItem class="w-full">
            <FormLabel>
              {{ $t('AGENT_MGMT.EDIT.FORM.AGENT_TYPE.LABEL') }}
            </FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem
                  v-for="role in roles"
                  :key="role.id"
                  :value="String(role.id)"
                >
                  {{ role.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="agentAvailability">
          <FormItem class="w-full">
            <FormLabel>{{
              $t('PROFILE_SETTINGS.FORM.AVAILABILITY.LABEL')
            }}</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem
                  v-for="status in availabilityStatuses"
                  :key="status.value"
                  :value="status.value"
                  :disabled="status.disabled"
                >
                  {{ status.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter class="sm:justify-between">
          <div class="ltr:text-left rtl:text-right">
            <Button
              v-if="provider !== 'saml'"
              variant="ghost"
              type="button"
              class="!px-2"
              @click.prevent="resetPassword"
            >
              <Icon icon="i-lucide-lock-keyhole" class="size-4" />
              {{ $t('AGENT_MGMT.EDIT.PASSWORD_RESET.ADMIN_RESET_BUTTON') }}
            </Button>
          </div>
          <div class="flex justify-end items-center gap-2">
            <DialogClose as-child>
              <Button variant="outline" type="button">
                {{ $t('AGENT_MGMT.EDIT.CANCEL_BUTTON_TEXT') }}
              </Button>
            </DialogClose>
            <Button
              variant="default"
              type="submit"
              :disabled="uiFlags.isUpdating"
            >
              <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
              <template v-if="!uiFlags.isUpdating">
                {{ $t('AGENT_MGMT.EDIT.FORM.SUBMIT') }}
              </template>
            </Button>
          </div>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>
