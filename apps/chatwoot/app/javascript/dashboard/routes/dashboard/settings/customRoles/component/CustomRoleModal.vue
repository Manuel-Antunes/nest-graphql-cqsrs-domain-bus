<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import {
  AVAILABLE_CUSTOM_ROLE_PERMISSIONS,
  MANAGE_ALL_CONVERSATION_PERMISSIONS,
  CONVERSATION_UNASSIGNED_PERMISSIONS,
  CONVERSATION_PARTICIPATING_PERMISSIONS,
} from 'dashboard/constants/permissions.js';

import { Button } from 'dashboard/components-next/ui/button';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Input } from 'dashboard/components-next/ui/input';
import { Textarea } from 'dashboard/components-next/ui/textarea';
import { Label } from 'dashboard/components-next/ui/label';
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

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: 'add',
    validator: value => ['add', 'edit'].includes(value),
  },
  selectedRole: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['close']);

const store = useStore();
const { t } = useI18n();

const nameInput = ref(null);
const roleForm = ref(null);

const addCustomRole = reactive({
  showLoading: false,
  message: '',
});

const validationSchema = toTypedSchema(
  z.object({
    name: z.string().min(2, t('CUSTOM_ROLE.FORM.NAME.ERROR')),
    description: z.string().min(1, t('CUSTOM_ROLE.FORM.DESCRIPTION.ERROR')),
    selectedPermissions: z
      .array(z.string())
      .min(1, t('CUSTOM_ROLE.FORM.PERMISSIONS.ERROR')),
  })
);

const initialValues = {
  name: props.mode === 'edit' ? props.selectedRole.name || '' : '',
  description:
    props.mode === 'edit' ? props.selectedRole.description || '' : '',
  selectedPermissions:
    props.mode === 'edit' ? props.selectedRole.permissions || [] : [],
};

const togglePermission = (permission, checked, current, setFieldValue) => {
  let list = current || [];
  if (checked) {
    if (!list.includes(permission)) {
      list = [...list, permission];
    }
  } else {
    list = list.filter(item => item !== permission);
  }

  // If manage all conversation permission is added, then add unassigned and
  // participating permissions automatically. Removing it only removes itself.
  if (permission === MANAGE_ALL_CONVERSATION_PERMISSIONS && checked) {
    list = [
      ...new Set([
        ...list,
        CONVERSATION_UNASSIGNED_PERMISSIONS,
        CONVERSATION_PARTICIPATING_PERMISSIONS,
      ]),
    ];
  }

  setFieldValue('selectedPermissions', list);
};

onMounted(() => {
  // Focus the name input when mounted
  nameInput.value?.$el?.focus?.();
});

const getTranslationKey = base => {
  return props.mode === 'edit'
    ? `CUSTOM_ROLE.EDIT.${base}`
    : `CUSTOM_ROLE.ADD.${base}`;
};

const modalTitle = computed(() => t(getTranslationKey('TITLE')));
const modalDescription = computed(() => t(getTranslationKey('DESC')));
const submitButtonText = computed(() => t(getTranslationKey('SUBMIT')));

const handleCustomRole = async formValues => {
  addCustomRole.showLoading = true;
  try {
    const roleData = {
      name: formValues.name,
      description: formValues.description,
      permissions: formValues.selectedPermissions,
    };

    if (props.mode === 'edit') {
      await store.dispatch('customRole/updateCustomRole', {
        id: props.selectedRole.id,
        ...roleData,
      });
      useAlert(t('CUSTOM_ROLE.EDIT.API.SUCCESS_MESSAGE'));
    } else {
      await store.dispatch('customRole/createCustomRole', roleData);
      useAlert(t('CUSTOM_ROLE.ADD.API.SUCCESS_MESSAGE'));
    }

    roleForm.value?.resetForm();
    emit('close');
  } catch (error) {
    const errorMessage =
      error?.message || t(`CUSTOM_ROLE.FORM.API.ERROR_MESSAGE`);
    useAlert(errorMessage);
  } finally {
    addCustomRole.showLoading = false;
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
        <DialogTitle>{{ modalTitle }}</DialogTitle>
        <DialogDescription>{{ modalDescription }}</DialogDescription>
      </DialogHeader>
      <Form
        ref="roleForm"
        v-slot="{ setFieldValue, meta }"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col w-full gap-4"
        @submit="handleCustomRole"
      >
        <FormField v-slot="{ componentField }" name="name">
          <FormItem class="w-full">
            <FormLabel>{{ $t('CUSTOM_ROLE.FORM.NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                ref="nameInput"
                v-bind="componentField"
                type="text"
                :placeholder="$t('CUSTOM_ROLE.FORM.NAME.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="description">
          <FormItem class="w-full">
            <FormLabel>{{
              $t('CUSTOM_ROLE.FORM.DESCRIPTION.LABEL')
            }}</FormLabel>
            <FormControl>
              <Textarea
                v-bind="componentField"
                :rows="3"
                :placeholder="$t('CUSTOM_ROLE.FORM.DESCRIPTION.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ value }" name="selectedPermissions">
          <FormItem class="w-full">
            <FormLabel>{{
              $t('CUSTOM_ROLE.FORM.PERMISSIONS.LABEL')
            }}</FormLabel>
            <div class="flex flex-col gap-2.5 mt-2">
              <div
                v-for="permission in AVAILABLE_CUSTOM_ROLE_PERMISSIONS"
                :key="permission"
                class="flex items-center gap-2"
              >
                <Checkbox
                  :id="permission"
                  :checked="(value || []).includes(permission)"
                  @update:checked="
                    checked =>
                      togglePermission(
                        permission,
                        checked,
                        value,
                        setFieldValue
                      )
                  "
                />
                <Label :for="permission" class="text-sm font-normal">
                  {{
                    $t(`CUSTOM_ROLE.PERMISSIONS.${permission.toUpperCase()}`)
                  }}
                </Label>
              </div>
            </div>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('CUSTOM_ROLE.FORM.CANCEL_BUTTON_TEXT') }}
            </Button>
          </DialogClose>
          <Button
            variant="default"
            type="submit"
            :disabled="!meta.valid || addCustomRole.showLoading"
          >
            <Spinner
              v-if="addCustomRole.showLoading"
              class="size-4 flex-shrink-0"
            />
            <template v-if="!addCustomRole.showLoading">
              {{ submitButtonText }}
            </template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>
