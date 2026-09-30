import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { usePolicy } from 'dashboard/composables/usePolicy';
import { useMapGetter } from 'dashboard/composables/store';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';

// Where the rail's Settings button lands, and the first entry of the settings sidebar.
export const SETTINGS_ENTRY_ROUTE = 'profile_settings_index';

// Every page that renders SettingsLayout lives under /settings/* or /profile/* (the
// notifications inbox at /notifications does not, despite its page folder). The layout
// list stays the source of truth for WHERE the settings sidebar renders; this is only
// for the rail's active state, which has no layout to ask.
const SETTINGS_PATH_RE = /^\/app\/accounts\/\d+\/(settings|profile)(\/|$)/;

export const isSettingsPath = path =>
  SETTINGS_PATH_RE.test((path || '').split('?')[0]);

/**
 * The settings section's navigation, shared by the rail (which only needs to know the
 * section exists and where it starts) and SettingsSidebar (which renders it). Items are
 * gated by the same route meta the rail uses — permissions / feature flag / installation.
 */
export function useSettingsMenu() {
  const { t } = useI18n();
  const { accountId, accountScopedRoute } = useAccount();
  const { resolveMeta } = useAppNavigation();
  const { shouldShow } = usePolicy();
  const isFeatureEnabledonAccount = useMapGetter(
    'accounts/isFeatureEnabledonAccount'
  );

  const isFeatureEnabled = flag =>
    isFeatureEnabledonAccount.value(accountId.value, flag);

  const items = computed(() => [
    {
      name: 'Settings Account',
      label: t('SIDEBAR.ACCOUNT_SETTINGS'),
      icon: 'i-lucide-circle-user',
      to: accountScopedRoute(SETTINGS_ENTRY_ROUTE),
    },
    {
      name: 'Settings General',
      label: t('SIDEBAR.GENERAL'),
      icon: 'i-lucide-sliders-horizontal',
      to: accountScopedRoute('general_settings_index'),
    },
    {
      name: 'Settings Agents',
      label: t('SIDEBAR.AGENTS'),
      icon: 'i-lucide-users',
      to: accountScopedRoute('agent_list'),
    },
    ...(isFeatureEnabled(FEATURE_FLAGS.ADVANCED_ASSIGNMENT)
      ? [
          {
            name: 'Settings Agent Assignment',
            label: t('SIDEBAR.AGENT_ASSIGNMENT'),
            icon: 'i-lucide-git-branch',
            activeOn: [
              'assignment_policy_index',
              'agent_assignment_policy_index',
              'agent_assignment_policy_create',
              'agent_assignment_policy_edit',
              'agent_capacity_policy_index',
              'agent_capacity_policy_create',
              'agent_capacity_policy_edit',
            ],
            to: accountScopedRoute('assignment_policy_index'),
          },
        ]
      : []),
    {
      name: 'Settings Inboxes',
      label: t('SIDEBAR.INBOXES'),
      icon: 'i-lucide-mailbox',
      activeOn: [
        'settings_inbox_list',
        'settings_inbox_show',
        'settings_inbox_new',
        'settings_inbox_finish',
        'settings_inboxes_page_channel',
        'settings_inboxes_add_agents',
      ],
      to: accountScopedRoute('settings_inbox_list'),
    },
    {
      name: 'Settings Templates',
      label: t('SIDEBAR.WHATSAPP_TEMPLATES'),
      icon: 'i-lucide-layout-template',
      to: accountScopedRoute('settings_templates'),
    },
    {
      name: 'Settings Labels',
      label: t('SIDEBAR.LABELS'),
      icon: 'i-lucide-tag',
      to: accountScopedRoute('labels_list'),
    },
    {
      name: 'Settings Custom Attributes',
      label: t('SIDEBAR.CUSTOM_ATTRIBUTES'),
      icon: 'i-lucide-list-plus',
      to: accountScopedRoute('attributes_list'),
    },
    {
      name: 'Settings Automation',
      label: t('SIDEBAR.AUTOMATION'),
      icon: 'i-lucide-zap',
      to: accountScopedRoute('automation_list'),
    },
    {
      name: 'Settings Agent Bots',
      label: t('SIDEBAR.AGENT_BOTS'),
      icon: 'i-lucide-bot',
      to: accountScopedRoute('agent_bots'),
    },
    {
      name: 'Settings Macros',
      label: t('SIDEBAR.MACROS'),
      icon: 'i-lucide-workflow',
      to: accountScopedRoute('macros_wrapper'),
    },
    {
      name: 'Settings Canned Responses',
      label: t('SIDEBAR.CANNED_RESPONSES'),
      icon: 'i-lucide-message-square-text',
      to: accountScopedRoute('canned_list'),
    },
    {
      name: 'Settings Integrations',
      label: t('SIDEBAR.INTEGRATIONS'),
      icon: 'i-lucide-plug',
      to: accountScopedRoute('settings_applications'),
    },
    ...(isFeatureEnabled(FEATURE_FLAGS.DATA_IMPORT)
      ? [
          {
            name: 'Settings Data',
            label: t('SIDEBAR.DATA'),
            icon: 'i-lucide-database',
            activeOn: ['settings_data_imports', 'settings_data_import_show'],
            to: accountScopedRoute('settings_data_imports'),
          },
        ]
      : []),
    {
      name: 'Settings Audit Logs',
      label: t('SIDEBAR.AUDIT_LOGS'),
      icon: 'i-lucide-scroll-text',
      to: accountScopedRoute('auditlogs_list'),
    },
    {
      name: 'Conversation Workflow',
      label: t('SIDEBAR.CONVERSATION_WORKFLOW'),
      icon: 'i-lucide-list-checks',
      to: accountScopedRoute('conversation_workflow_index'),
    },
    {
      name: 'Settings Billing',
      label: t('SIDEBAR.BILLING'),
      icon: 'i-lucide-credit-card',
      to: accountScopedRoute('billing_settings_index'),
    },
  ]);

  const isAllowed = to => {
    if (!to) return true;
    const meta = resolveMeta(to);
    return shouldShow(
      meta.featureFlag || '',
      meta.permissions ?? [],
      meta.installationTypes ?? []
    );
  };

  const visibleItems = computed(() => items.value.filter(i => isAllowed(i.to)));

  return { visibleItems };
}
