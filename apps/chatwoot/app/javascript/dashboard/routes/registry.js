// AUTO-GENERATED from vue-router's resolved routes (see routes/index.js dev export).
// Regenerate by dumping window.__cwRouter.getRoutes() in the SPA. Hand-edits to
// `inertia: true` flags (which routes Inertia serves) are preserved intentionally.
//
// Vue-router-independent route registry: name -> { path, meta, inertia }. This is the
// primitive that lets the app navigate + gate WITHOUT vue-router (the migration goal).

export const ROUTE_REGISTRY = {
  account_overview_reports: { path: '/app/accounts/:accountId/reports/overview', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  account_suspended: { path: '/app/accounts/:accountId/suspended', meta: { permissions: ['administrator', 'agent', 'custom_role'] }, inertia: true },
  agent_assignment_policy_create: { path: '/app/accounts/:accountId/settings/assignment-policy/assignment/create', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_assignment_policy_edit: { path: '/app/accounts/:accountId/settings/assignment-policy/assignment/edit/:id', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_assignment_policy_index: { path: '/app/accounts/:accountId/settings/assignment-policy/assignment', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_bots: { path: '/app/accounts/:accountId/settings/agent-bots', meta: { permissions: ['administrator'], featureFlag: 'agent_bots' }, inertia: true },
  agent_capacity_policy_create: { path: '/app/accounts/:accountId/settings/assignment-policy/capacity/create', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_capacity_policy_edit: { path: '/app/accounts/:accountId/settings/assignment-policy/capacity/edit/:id', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_capacity_policy_index: { path: '/app/accounts/:accountId/settings/assignment-policy/capacity', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  agent_list: { path: '/app/accounts/:accountId/settings/agents/list', meta: { permissions: ['administrator'], featureFlag: 'agent_management' }, inertia: true },
  agent_reports: { path: '/app/accounts/:accountId/reports/agent', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  agent_reports_index: { path: '/app/accounts/:accountId/reports/agents_overview', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  agent_reports_show: { path: '/app/accounts/:accountId/reports/agents/:id', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  assignment_policy_index: { path: '/app/accounts/:accountId/settings/assignment-policy/index', meta: { permissions: ['administrator'], featureFlag: 'assignment_v2' }, inertia: true },
  attributes_list: { path: '/app/accounts/:accountId/settings/custom-attributes/list', meta: { permissions: ['administrator'], featureFlag: 'custom_attributes' }, inertia: true },
  auditlogs_list: { path: '/app/accounts/:accountId/settings/audit-logs/list', meta: { permissions: ['administrator'], featureFlag: 'audit_logs', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  automation_list: { path: '/app/accounts/:accountId/settings/automation/list', meta: { permissions: ['administrator'], featureFlag: 'automations' }, inertia: true },
  billing_settings_index: { path: '/app/accounts/:accountId/settings/billing', meta: { permissions: ['administrator'], installationTypes: ['cloud'] }, inertia: true },
  bot_reports: { path: '/app/accounts/:accountId/reports/bot', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  campaigns_livechat_index: { path: '/app/accounts/:accountId/campaigns/live_chat', meta: { permissions: ['administrator'], featureFlag: 'campaigns' }, inertia: true },
  campaigns_one_off_index: { path: '/app/accounts/:accountId/campaigns/one_off', meta: { permissions: ['administrator'], featureFlag: 'campaigns' }, inertia: true },
  campaigns_ongoing_index: { path: '/app/accounts/:accountId/campaigns/ongoing', meta: { permissions: ['administrator'], featureFlag: 'campaigns' }, inertia: true },
  campaigns_sms_index: { path: '/app/accounts/:accountId/campaigns/sms', meta: { permissions: ['administrator'], featureFlag: 'campaigns' }, inertia: true },
  campaigns_whatsapp_index: { path: '/app/accounts/:accountId/campaigns/whatsapp', meta: { permissions: ['administrator'], featureFlag: 'whatsapp_campaign' }, inertia: true },
  canned_list: { path: '/app/accounts/:accountId/settings/canned-response/list', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'], featureFlag: 'canned_responses' }, inertia: true },
  captain_assistants_create_index: { path: '/app/accounts/:accountId/captain/assistants', meta: { permissions: ['administrator', 'agent'], installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_documents_index: { path: '/app/accounts/:accountId/captain/:assistantId/documents', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_guardrails_index: { path: '/app/accounts/:accountId/captain/:assistantId/settings/guardrails', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration_v2', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_guidelines_index: { path: '/app/accounts/:accountId/captain/:assistantId/settings/guidelines', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration_v2', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_inboxes_index: { path: '/app/accounts/:accountId/captain/:assistantId/inboxes', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_index: { path: '/app/accounts/:accountId/captain/:navigationPath', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_playground_index: { path: '/app/accounts/:accountId/captain/:assistantId/playground', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_responses_index: { path: '/app/accounts/:accountId/captain/:assistantId/faqs', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_responses_pending: { path: '/app/accounts/:accountId/captain/:assistantId/faqs/pending', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_scenarios_index: { path: '/app/accounts/:accountId/captain/:assistantId/scenarios', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration_v2', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_assistants_settings_index: { path: '/app/accounts/:accountId/captain/:assistantId/settings', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  captain_settings_index: { path: '/app/accounts/:accountId/settings/captain', meta: { permissions: ['administrator'], featureFlag: 'captain_integration', installationTypes: ['enterprise', 'cloud'] }, inertia: true },
  captain_tools_index: { path: '/app/accounts/:accountId/captain/:assistantId/tools', meta: { permissions: ['administrator', 'agent'], featureFlag: 'captain_integration_v2', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  companies_dashboard_index: { path: '/app/accounts/:accountId/companies', meta: { permissions: ['administrator', 'agent'], featureFlag: 'companies', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  contacts_dashboard_active: { path: '/app/accounts/:accountId/contacts/active', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_dashboard_index: { path: '/app/accounts/:accountId/contacts', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_dashboard_labels_index: { path: '/app/accounts/:accountId/contacts/labels/:label', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_dashboard_segments_index: { path: '/app/accounts/:accountId/contacts/segments/:segmentId', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_edit: { path: '/app/accounts/:accountId/contacts/:contactId', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_edit_label: { path: '/app/accounts/:accountId/contacts/:contactId/labels/:label', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  contacts_edit_segment: { path: '/app/accounts/:accountId/contacts/:contactId/segments/:segmentId', meta: { permissions: ['administrator', 'agent', 'contact_manage'], featureFlag: 'crm' }, inertia: true },
  conversation_mentions: { path: '/app/accounts/:accountId/mentions/conversations', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_participating: { path: '/app/accounts/:accountId/participating/conversations', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_reports: { path: '/app/accounts/:accountId/reports/conversation', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  conversation_through_inbox: { path: '/app/accounts/:accountId/inbox/:inbox_id/conversations/:conversation_id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_through_mentions: { path: '/app/accounts/:accountId/mentions/conversations/:conversationId', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_through_participating: { path: '/app/accounts/:accountId/participating/conversations/:conversationId', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_through_unattended: { path: '/app/accounts/:accountId/unattended/conversations/:conversationId', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversation_unattended: { path: '/app/accounts/:accountId/unattended/conversations', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversations_through_folders: { path: '/app/accounts/:accountId/custom_view/:id/conversations/:conversation_id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversations_through_label: { path: '/app/accounts/:accountId/label/:label/conversations/:conversation_id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  conversations_through_team: { path: '/app/accounts/:accountId/team/:teamId/conversations/:conversationId', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  csat_reports: { path: '/app/accounts/:accountId/reports/csat', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  custom_roles_list: { path: '/app/accounts/:accountId/settings/custom-roles/list', meta: { permissions: ['administrator'], featureFlag: 'custom_roles', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  folder_conversations: { path: '/app/accounts/:accountId/custom_view/:id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  general_settings_index: { path: '/app/accounts/:accountId/settings/general', meta: { permissions: ['administrator'] }, inertia: true },
  home: { path: '/app/accounts/:accountId/dashboard', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  inbox_conversation: { path: '/app/accounts/:accountId/conversations/:conversation_id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  inbox_dashboard: { path: '/app/accounts/:accountId/inbox/:inbox_id', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  inbox_reports: { path: '/app/accounts/:accountId/reports/inboxes', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  inbox_reports_index: { path: '/app/accounts/:accountId/reports/inboxes_overview', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  inbox_reports_show: { path: '/app/accounts/:accountId/reports/inboxes/:id', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  inbox_view: { path: '/app/accounts/:accountId/inbox-view', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  inbox_view_conversation: { path: '/app/accounts/:accountId/inbox-view/:type/:id', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  label_conversations: { path: '/app/accounts/:accountId/label/:label', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  label_reports: { path: '/app/accounts/:accountId/reports/label', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  label_reports_index: { path: '/app/accounts/:accountId/reports/labels_overview', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  label_reports_show: { path: '/app/accounts/:accountId/reports/labels/:id', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  labels_list: { path: '/app/accounts/:accountId/settings/labels/list', meta: { permissions: ['administrator'], featureFlag: 'labels' }, inertia: true },
  labels_wrapper: { path: '/app/accounts/:accountId/settings/labels', meta: { permissions: ['administrator'] }, inertia: true },
  macros_edit: { path: '/app/accounts/:accountId/settings/macros/:macroId/edit', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'], featureFlag: 'macros' }, inertia: true },
  macros_new: { path: '/app/accounts/:accountId/settings/macros/new', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'], featureFlag: 'macros' }, inertia: true },
  macros_wrapper: { path: '/app/accounts/:accountId/settings/macros', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'], featureFlag: 'macros' }, inertia: true },
  no_accounts: { path: '/app/no-accounts', meta: {}, inertia: true },
  notifications_index: { path: '/app/accounts/:accountId/notifications', meta: { permissions: ['administrator', 'agent', 'custom_role'] }, inertia: true },
  portals_articles_edit: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/:categorySlug?/articles/:tab?/edit/:articleSlug', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_articles_index: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/:categorySlug?/articles/:tab?', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_articles_new: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/:categorySlug?/articles/new', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_categories_articles_edit: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/categories/:categorySlug/articles/:articleSlug', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_categories_articles_index: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/categories/:categorySlug/articles', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_categories_index: { path: '/app/accounts/:accountId/portals/:portalSlug/:locale/categories', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_index: { path: '/app/accounts/:accountId/portals/:navigationPath', meta: { permissions: ['administrator', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_locales_index: { path: '/app/accounts/:accountId/portals/:portalSlug/locales', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_new: { path: '/app/accounts/:accountId/portals/new', meta: { permissions: ['administrator', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  portals_settings_index: { path: '/app/accounts/:accountId/portals/:portalSlug/settings', meta: { permissions: ['administrator', 'agent', 'knowledge_base_manage'], featureFlag: 'help_center' }, inertia: true },
  profile_settings: { path: '/app/accounts/:accountId/profile', meta: { permissions: ['administrator', 'agent', 'custom_role'] }, inertia: true },
  profile_settings_index: { path: '/app/accounts/:accountId/profile/settings', meta: { permissions: ['administrator', 'agent', 'custom_role'] }, inertia: true },
  profile_settings_mfa: { path: '/app/accounts/:accountId/profile/mfa', meta: { permissions: ['administrator', 'agent', 'custom_role'] }, inertia: true },
  search: { path: '/app/accounts/:accountId/search/:tab?', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage', 'contact_manage', 'knowledge_base_manage'] }, inertia: true },
  security_settings_index: { path: '/app/accounts/:accountId/settings/security', meta: { permissions: ['administrator'], featureFlag: 'saml', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  settings_applications: { path: '/app/accounts/:accountId/settings/integrations', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_applications_integration: { path: '/app/accounts/:accountId/settings/integrations/:integration_id', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_home: { path: '/app/accounts/:accountId/settings', meta: { permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  settings_inbox_finish: { path: '/app/accounts/:accountId/settings/inboxes/new/:inbox_id/finish', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_inbox_list: { path: '/app/accounts/:accountId/settings/inboxes/list', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_inbox_new: { path: '/app/accounts/:accountId/settings/inboxes/new', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_inbox_show: { path: '/app/accounts/:accountId/settings/inboxes/:inboxId/:tab?', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_inboxes_add_agents: { path: '/app/accounts/:accountId/settings/inboxes/new/:inbox_id/agents', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_inboxes_page_channel: { path: '/app/accounts/:accountId/settings/inboxes/new/:sub_page', meta: { permissions: ['administrator'], featureFlag: 'inbox_management' }, inertia: true },
  settings_integrations_dashboard_apps: { path: '/app/accounts/:accountId/settings/integrations/dashboard_apps', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_integrations_linear: { path: '/app/accounts/:accountId/settings/integrations/linear', meta: { permissions: ['administrator'] }, inertia: true },
  settings_integrations_notion: { path: '/app/accounts/:accountId/settings/integrations/notion', meta: { permissions: ['administrator'] }, inertia: true },
  settings_integrations_shopify: { path: '/app/accounts/:accountId/settings/integrations/shopify', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_integrations_slack: { path: '/app/accounts/:accountId/settings/integrations/slack', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_integrations_webhook: { path: '/app/accounts/:accountId/settings/integrations/webhook', meta: { permissions: ['administrator'], featureFlag: 'integrations' }, inertia: true },
  settings_teams_add_agents: { path: '/app/accounts/:accountId/settings/teams/new/:teamId/agents', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_edit: { path: '/app/accounts/:accountId/settings/teams/:teamId/edit', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_edit_finish: { path: '/app/accounts/:accountId/settings/teams/:teamId/edit/finish', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_edit_members: { path: '/app/accounts/:accountId/settings/teams/:teamId/edit/agents', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_finish: { path: '/app/accounts/:accountId/settings/teams/new/:teamId/finish', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_list: { path: '/app/accounts/:accountId/settings/teams/list', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  settings_teams_new: { path: '/app/accounts/:accountId/settings/teams/new', meta: { permissions: ['administrator'], featureFlag: 'team_management' }, inertia: true },
  sla_list: { path: '/app/accounts/:accountId/settings/sla/list', meta: { permissions: ['administrator'], featureFlag: 'sla', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  sla_reports: { path: '/app/accounts/:accountId/reports/sla', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  sla_wrapper: { path: '/app/accounts/:accountId/settings/sla', meta: { permissions: ['administrator'], featureFlag: 'sla', installationTypes: ['cloud', 'enterprise'] }, inertia: true },
  team_conversations: { path: '/app/accounts/:accountId/team/:teamId', meta: { permissions: ['administrator', 'agent', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'] }, inertia: true },
  team_reports: { path: '/app/accounts/:accountId/reports/teams', meta: { permissions: ['administrator', 'report_manage'], featureFlag: 'reports' }, inertia: true },
  team_reports_index: { path: '/app/accounts/:accountId/reports/teams_overview', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
  team_reports_show: { path: '/app/accounts/:accountId/reports/teams/:id', meta: { permissions: ['administrator', 'report_manage'] }, inertia: true },
};

/**
 * Resolve a registry route name + params into a URL path.
 * @param {string} name - route name
 * @param {object} [params] - path params (e.g. { accountId, id })
 * @returns {string|null} the interpolated path, or null if the name is unknown
 */
export function resolveRegistryPath(name, params = {}) {
  const entry = ROUTE_REGISTRY[name];
  if (!entry) return null;

  // Segment-wise so an OMITTED optional param (`:tab?`, `:categorySlug?`) drops the
  // whole segment instead of leaving an empty `//`.
  const path = entry.path
    .split('/')
    .flatMap(seg => {
      if (!seg.startsWith(':')) return [seg];
      const key = seg.slice(1).replace(/\?$/, '');
      const val = params[key];
      if (val != null && val !== '') return [String(val)];
      return seg.endsWith('?') ? [] : [''];
    })
    .join('/');

  return path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

export function isInertiaRoute(name) {
  return Boolean(ROUTE_REGISTRY[name]?.inertia);
}

// Reverse matchers (URL path -> route name), for code that needs the current route name
// without vue-router (there is no `route.name` under Inertia). Most-specific first so a
// static segment out-ranks a param (e.g. /contacts/active over /contacts/:contactId).
const REVERSE_MATCHERS = Object.entries(ROUTE_REGISTRY)
  .map(([name, { path }]) => {
    const segs = path.split('/');
    return {
      name,
      staticCount: segs.filter(s => s && !s.startsWith(':')).length,
      length: path.length,
      regex: new RegExp(
        `^${segs
          .map((seg, i) => {
            if (i === 0) return '';
            const optional = seg.startsWith(':') && seg.endsWith('?');
            const body = seg.startsWith(':')
              ? '[^/]+'
              : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return optional ? `(?:/${body})?` : `/${body}`;
          })
          .join('')}/?$`
      ),
    };
  })
  .sort((a, b) => b.staticCount - a.staticCount || b.length - a.length);

// Reverse-match a URL path (default: the current location) to its registry route name.
export function routeNameForPath(path = window.location.pathname) {
  const clean = (path || '').split('?')[0];
  return REVERSE_MATCHERS.find(m => m.regex.test(clean))?.name ?? null;
}
