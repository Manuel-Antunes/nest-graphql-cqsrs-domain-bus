import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useMacroExecution } from 'dashboard/composables/useMacroExecution';
import { useOrderedMacros } from 'dashboard/composables/useOrderedMacros';
import { usePolicy } from 'dashboard/composables/usePolicy';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
import { ICON_TOY_BRICK } from 'dashboard/helper/commandbar/icons';
import {
  isAConversationRoute,
  isAInboxViewRoute,
} from 'dashboard/helper/routeHelpers';

export function useMacroHotKeys() {
  const { t } = useI18n();
  const store = useStore();
  const { currentRouteName } = useAppNavigation();

  const { orderedMacros } = useOrderedMacros();
  const { execute, submitPendingAttributes, dismissPendingAttributes } =
    useMacroExecution();
  const { isFeatureFlagEnabled } = usePolicy();

  const currentChat = useMapGetter('getSelectedChat');
  const pendingAttributes = ref(null);

  const isMacrosAvailable = computed(
    () =>
      isFeatureFlagEnabled(FEATURE_FLAGS.MACROS) &&
      (isAConversationRoute(currentRouteName.value) ||
        isAInboxViewRoute(currentRouteName.value))
  );

  watch(
    isMacrosAvailable,
    isActive => {
      if (isActive && !orderedMacros.value.length) store.dispatch('macros/get');
    },
    { immediate: true }
  );

  const macroHotKeys = computed(() => {
    if (!isMacrosAvailable.value || !orderedMacros.value.length) {
      return [];
    }

    const options = orderedMacros.value.map(macro => ({
      id: `macro-${macro.id}`,
      title: macro.name,
      parent: 'execute_a_macro',
      section: t('COMMAND_BAR.SECTIONS.EXECUTE_MACRO'),
      icon: ICON_TOY_BRICK,
      handler: () => {
        pendingAttributes.value = execute(macro, currentChat.value.id);
      },
    }));

    return [
      {
        id: 'execute_a_macro',
        title: t('COMMAND_BAR.COMMANDS.EXECUTE_A_MACRO'),
        section: t('COMMAND_BAR.SECTIONS.CONVERSATION'),
        icon: ICON_TOY_BRICK,
        children: options.map(option => option.id),
      },
      ...options,
    ];
  });

  return {
    macroHotKeys,
    pendingAttributes,
    submitPendingAttributes,
    dismissPendingAttributes,
  };
}
