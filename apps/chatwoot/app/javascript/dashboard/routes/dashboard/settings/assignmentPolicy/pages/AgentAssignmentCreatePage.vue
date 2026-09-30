<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useAlert } from 'dashboard/composables';

import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from 'dashboard/components-next/ui/breadcrumb';
import SettingsLayout from 'dashboard/routes/dashboard/settings/SettingsLayout.vue';
import AssignmentPolicyForm from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/components/AgentAssignmentPolicyForm.vue';

const { visit } = useAppNavigation();
const store = useStore();
const { t } = useI18n();

const formRef = ref(null);
const uiFlags = useMapGetter('assignmentPolicies/getUIFlags');

const breadcrumbItems = computed(() => [
  {
    label: t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.INDEX.HEADER.TITLE'),
    routeName: 'agent_assignment_policy_index',
  },
  {
    label: t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.HEADER.TITLE'),
  },
]);

const handleBreadcrumbClick = item => {
  visit({
    name: item.routeName,
  });
};

const handleSubmit = async formState => {
  try {
    const policy = await store.dispatch('assignmentPolicies/create', formState);
    useAlert(
      t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.API.SUCCESS_MESSAGE')
    );
    formRef.value?.resetForm();

    visit({
      name: 'agent_assignment_policy_edit',
      params: {
        id: policy.id,
      },
    });
  } catch (error) {
    useAlert(
      t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <SettingsLayout class="xl:px-44">
    <template #header>
      <div class="flex items-center gap-2 w-full justify-between">
        <BreadcrumbRoot>
          <BreadcrumbList>
            <template v-for="(item, index) in breadcrumbItems" :key="index">
              <BreadcrumbSeparator v-if="index > 0" />
              <BreadcrumbItem>
                <BreadcrumbLink
                  v-if="index !== breadcrumbItems.length - 1"
                  as="button"
                  type="button"
                  class="cursor-pointer border-0 bg-transparent p-0"
                  @click="handleBreadcrumbClick(item, index)"
                >
                  {{ item.label }}
                </BreadcrumbLink>
                <BreadcrumbPage v-else>
                  {{ item.emoji ? `${item.emoji} ${item.label}` : item.label }}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </BreadcrumbRoot>
      </div>
    </template>

    <template #body>
      <AssignmentPolicyForm
        ref="formRef"
        mode="CREATE"
        :is-loading="uiFlags.isCreating"
        @submit="handleSubmit"
      />
    </template>
  </SettingsLayout>
</template>
