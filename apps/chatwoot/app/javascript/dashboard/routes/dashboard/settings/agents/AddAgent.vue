<script setup>
import { computed } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
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

defineProps({
  open: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

const store = useStore();
const { t } = useI18n();

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
  roles.value.find(role => role.id === roleId || role.name === roleId);

const validationSchema = toTypedSchema(
  z.object({
    agentName: z.string().min(1, t('AGENT_MGMT.ADD.FORM.NAME.ERROR')),
    agentEmail: z
      .string()
      .min(1, t('AGENT_MGMT.ADD.FORM.EMAIL.ERROR'))
      .email(t('AGENT_MGMT.ADD.FORM.EMAIL.ERROR')),
    selectedRoleId: z
      .string()
      .min(1, t('AGENT_MGMT.ADD.FORM.AGENT_TYPE.ERROR')),
  })
);

const initialValues = {
  agentName: '',
  agentEmail: '',
  selectedRoleId: 'agent',
};

const onSubmit = async values => {
  try {
    const role = findRole(values.selectedRoleId);
    const payload = {
      name: values.agentName,
      email: values.agentEmail,
    };

    if (role?.name.startsWith('custom_')) {
      payload.custom_role_id = role.id;
    } else {
      payload.role = role?.name;
    }

    await store.dispatch('agents/create', payload);
    useAlert(t('AGENT_MGMT.ADD.API.SUCCESS_MESSAGE'));
    emit('close');
  } catch (error) {
    const {
      response: {
        data: {
          error: errorResponse = '',
          attributes: attributes = [],
          message: attrError = '',
        } = {},
      } = {},
    } = error;

    let errorMessage = '';
    if (error?.response?.status === 422 && !attributes.includes('base')) {
      errorMessage = t('AGENT_MGMT.ADD.API.EXIST_MESSAGE');
    } else {
      errorMessage = t('AGENT_MGMT.ADD.API.ERROR_MESSAGE');
    }
    useAlert(errorResponse || attrError || errorMessage);
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
        <DialogTitle>{{ $t('AGENT_MGMT.ADD.TITLE') }}</DialogTitle>
        <DialogDescription>{{ $t('AGENT_MGMT.ADD.DESC') }}</DialogDescription>
      </DialogHeader>
      <Form
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col items-start w-full gap-4"
        @submit="onSubmit"
      >
        <FormField v-slot="{ componentField }" name="agentName">
          <FormItem class="w-full">
            <FormLabel>{{ $t('AGENT_MGMT.ADD.FORM.NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="text"
                :placeholder="$t('AGENT_MGMT.ADD.FORM.NAME.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="selectedRoleId">
          <FormItem class="w-full">
            <FormLabel>
              {{ $t('AGENT_MGMT.ADD.FORM.AGENT_TYPE.LABEL') }}
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
                  :value="role.name"
                >
                  {{ role.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="agentEmail">
          <FormItem class="w-full">
            <FormLabel>{{ $t('AGENT_MGMT.ADD.FORM.EMAIL.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="email"
                :placeholder="$t('AGENT_MGMT.ADD.FORM.EMAIL.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('AGENT_MGMT.ADD.CANCEL_BUTTON_TEXT') }}
            </Button>
          </DialogClose>
          <Button
            variant="default"
            type="submit"
            :disabled="uiFlags.isCreating"
          >
            <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isCreating">
              {{ $t('AGENT_MGMT.ADD.FORM.SUBMIT') }}
            </template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>
