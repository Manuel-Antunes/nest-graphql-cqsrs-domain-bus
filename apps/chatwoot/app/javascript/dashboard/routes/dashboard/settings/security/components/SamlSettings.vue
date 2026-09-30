<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useAlert } from 'dashboard/composables';
import { useAccount } from 'dashboard/composables/useAccount';
import samlSettingsAPI from 'dashboard/api/samlSettings';

import SectionLayout from '../../account/components/SectionLayout.vue';
import WithLabel from 'v3/components/Form/WithLabel.vue';
import TextInput from 'next/input/Input.vue';
import TextArea from 'next/textarea/TextArea.vue';
import { Switch } from 'dashboard/components-next/ui/switch';
import { Button } from 'next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import SamlInfoSection from './SamlInfoSection.vue';
import SamlAttributeMap from './SamlAttributeMap.vue';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const { t } = useI18n();
const { isCloudFeatureEnabled } = useAccount();

const samlForm = ref(null);
const id = ref(null);
const fingerprint = ref('');
const spEntityId = ref('');
const isEnabled = ref(false);
const isSubmitting = ref(false);
const isLoading = ref(true);

const validationSchema = toTypedSchema(
  z.object({
    ssoUrl: z
      .string()
      .min(1, t('SECURITY_SETTINGS.SAML.VALIDATION.SSO_URL_ERROR')),
    idpEntityId: z
      .string()
      .min(1, t('SECURITY_SETTINGS.SAML.VALIDATION.IDP_ENTITY_ID_ERROR')),
    certificate: z
      .string()
      .min(1, t('SECURITY_SETTINGS.SAML.VALIDATION.CERTIFICATE_ERROR')),
  })
);

const initialValues = { ssoUrl: '', idpEntityId: '', certificate: '' };

const hasFeature = computed(() => isCloudFeatureEnabled('saml'));

const loadSamlSettings = async () => {
  if (!hasFeature.value) return;

  try {
    isLoading.value = true;
    const response = await samlSettingsAPI.get();
    const settings = response.data;

    if (settings.sso_url) {
      id.value = settings.id;
      spEntityId.value = settings.sp_entity_id || '';
      fingerprint.value = settings.fingerprint || '';
      isEnabled.value = settings.sso_url !== '';
      samlForm.value?.setValues({
        ssoUrl: settings.sso_url,
        certificate: settings.certificate || '',
        idpEntityId: settings.idp_entity_id || '',
      });
    }
  } catch (error) {
    // If no settings exist (404), that's expected - just keep defaults
    if (error.response?.status !== 404) {
      useAlert(t('SECURITY_SETTINGS.SAML.API.ERROR_LOADING'));
    }
  } finally {
    isLoading.value = false;
  }
};

const saveSamlSettings = async settings => {
  try {
    isSubmitting.value = true;

    if (isEnabled.value && settings.sso_url) {
      // Create or update settings based on existing id
      let response;
      if (id.value) {
        response = await samlSettingsAPI.update(settings);
      } else {
        response = await samlSettingsAPI.create(settings);
      }

      // Update local state with response data including fingerprint and id
      if (response?.data) {
        id.value = response.data.id;
        fingerprint.value = response.data.fingerprint || '';
        spEntityId.value = response.data.sp_entity_id || '';
      }

      useAlert(t('SECURITY_SETTINGS.SAML.API.SUCCESS'));
    } else {
      // Disable/delete settings
      await samlSettingsAPI.delete();
      useAlert(t('SECURITY_SETTINGS.SAML.API.DISABLED'));
    }
  } catch (error) {
    // Handle backend validation errors
    if (error.response?.data?.errors) {
      const errorMessages = error.response.data.errors;
      const firstError = Array.isArray(errorMessages)
        ? errorMessages[0]
        : errorMessages;
      useAlert(firstError);
    } else {
      useAlert(t('SECURITY_SETTINGS.SAML.API.ERROR'));
    }
    throw error;
  } finally {
    isSubmitting.value = false;
  }
};

const handleSubmit = async values => {
  await saveSamlSettings({
    sso_url: values.ssoUrl,
    certificate: values.certificate,
    idp_entity_id: values.idpEntityId,
    role_mappings: {},
  });
};

const handleDisable = async () => {
  id.value = null;
  spEntityId.value = '';
  fingerprint.value = '';
  samlForm.value?.resetForm({
    values: { ssoUrl: '', idpEntityId: '', certificate: '' },
  });

  // the empty save will delete the SAML settings item
  await saveSamlSettings({});
};

const toggleSaml = async () => {
  if (!isEnabled.value) {
    await handleDisable();
  }
};

onMounted(() => {
  loadSamlSettings();
});
</script>

<template>
  <SectionLayout
    :title="t('SECURITY_SETTINGS.SAML.TITLE')"
    :description="t('SECURITY_SETTINGS.SAML.NOTE')"
    beta
    :hide-content="!hasFeature || !isEnabled || isLoading"
  >
    <template #headerActions>
      <div class="flex justify-end">
        <Switch
          v-model="isEnabled"
          :disabled="isLoading"
          @update:model-value="toggleSaml"
        />
      </div>
    </template>

    <SamlInfoSection
      class="mb-5"
      :fingerprint="fingerprint"
      :sp-entity-id="spEntityId"
    />
    <SamlAttributeMap class="mb-5" />

    <Form
      ref="samlForm"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="grid gap-5"
      @submit="handleSubmit"
    >
      <FormField v-slot="{ componentField, errorMessage }" name="ssoUrl">
        <WithLabel
          name="ssoUrl"
          :label="t('SECURITY_SETTINGS.SAML.SSO_URL.LABEL')"
          :help-message="t('SECURITY_SETTINGS.SAML.SSO_URL.HELP')"
          :has-error="!!errorMessage"
          :error-message="errorMessage"
          required
        >
          <TextInput
            v-bind="componentField"
            class="w-full"
            type="url"
            :placeholder="t('SECURITY_SETTINGS.SAML.SSO_URL.PLACEHOLDER')"
          />
        </WithLabel>
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="idpEntityId">
        <WithLabel
          name="idpEntityId"
          :label="t('SECURITY_SETTINGS.SAML.IDP_ENTITY_ID.LABEL')"
          :help-message="t('SECURITY_SETTINGS.SAML.IDP_ENTITY_ID.HELP')"
          :has-error="!!errorMessage"
          :error-message="errorMessage"
          required
        >
          <TextInput
            v-bind="componentField"
            class="w-full"
            :placeholder="t('SECURITY_SETTINGS.SAML.IDP_ENTITY_ID.PLACEHOLDER')"
          />
        </WithLabel>
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="certificate">
        <WithLabel
          name="certificate"
          :label="t('SECURITY_SETTINGS.SAML.CERTIFICATE.LABEL')"
          :help-message="t('SECURITY_SETTINGS.SAML.CERTIFICATE.HELP')"
          :has-error="!!errorMessage"
          :error-message="errorMessage"
          required
        >
          <TextArea
            v-bind="componentField"
            class="w-full"
            rows="8"
            :placeholder="t('SECURITY_SETTINGS.SAML.CERTIFICATE.PLACEHOLDER')"
          />
        </WithLabel>
      </FormField>

      <div class="flex gap-2">
        <Button type="submit" :disabled="isSubmitting">
          <Spinner v-if="isSubmitting" class="size-4" />
          {{ t('SECURITY_SETTINGS.SAML.UPDATE_BUTTON') }}
        </Button>
      </div>
    </Form>
  </SectionLayout>
</template>
