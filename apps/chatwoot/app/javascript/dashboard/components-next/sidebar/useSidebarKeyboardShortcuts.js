import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

export function useSidebarKeyboardShortcuts(toggleShortcutModalFn) {
  const { currentRouteName, visit } = useAppNavigation();

  const isCurrentRouteSameAsNavigation = routeName => {
    return currentRouteName.value === routeName;
  };

  const navigateToRoute = routeName => {
    if (!isCurrentRouteSameAsNavigation(routeName)) {
      visit({ name: routeName });
    }
  };
  const keyboardEvents = {
    '$mod+Slash': {
      action: () => toggleShortcutModalFn(true),
    },
    '$mod+Escape': {
      action: () => toggleShortcutModalFn(false),
    },
    'Alt+KeyC': {
      action: () => navigateToRoute('home'),
    },
    'Alt+KeyV': {
      action: () => navigateToRoute('contacts_dashboard'),
    },
    'Alt+KeyR': {
      action: () => navigateToRoute('account_overview_reports'),
    },
    'Alt+KeyS': {
      action: () => navigateToRoute('agent_list'),
    },
  };

  return useKeyboardEvents(keyboardEvents);
}
