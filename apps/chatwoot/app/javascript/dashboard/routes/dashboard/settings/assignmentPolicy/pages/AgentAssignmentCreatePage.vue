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

const { visit, resolvePath } = useAppNavigation();
const store = useStore();
const { t } = useI18n();

const formRef = ref(null);
const uiFlags = useMapGetter('assignmentPolicies/getUIFlags');

const inboxIdFromQuery = computed(() => {
  const id = new URLSearchParams(window.location.search).get('inboxId');
  return id ? Number(id) : null;
});

const breadcrumbItems = computed(() => {
  if (inboxIdFromQuery.value) {
    return [
      {
        label: t('INBOX_MGMT.SETTINGS'),
        routeName: 'settings_inbox_show',
        params: { inboxId: inboxIdFromQuery.value },
      },
      {
        label: t(
          'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.HEADER.TITLE'
        ),
      },
    ];
  }
  return [
    {
      label: t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.INDEX.HEADER.TITLE'),
      routeName: 'agent_assignment_policy_index',
    },
    {
      label: t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.HEADER.TITLE'),
    },
  ];
});

const handleBreadcrumbClick = item => {
  if (item.params) {
    visit({
      name: 'settings_inbox_show',
      params: { inboxId: item.params.inboxId, tab: 'collaborators' },
    });
  } else {
    visit({
      name: item.routeName,
    });
  }
};

const handleSubmit = async formState => {
  try {
    const policy = await store.dispatch('assignmentPolicies/create', formState);
    useAlert(
      t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.API.SUCCESS_MESSAGE')
    );
    formRef.value?.resetForm();

    const editPath = resolvePath({
      name: 'agent_assignment_policy_edit',
      params: {
        id: policy.id,
      },
    });
    // Pass inboxId to edit page to show link prompt
    visit(
      inboxIdFromQuery.value
        ? `${editPath}?inboxId=${inboxIdFromQuery.value}`
        : editPath
    );
  } catch (error) {
    useAlert(
      t('ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.CREATE.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <SettingsLayout class="w-full max-w-2xl ltr:mr-auto rtl:ml-auto">
    <template #header>
      <div class="flex items-center gap-2 w-full justify-between mb-4 min-h-10">
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
