import { computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import {
  frontendURL,
  conversationUrl,
  conversationListPageURL,
} from 'dashboard/helper/URLHelper';
import {
  isOnMentionsView,
  isOnParticipatingView,
  isOnUnattendedView,
  isOnFoldersView,
} from 'dashboard/store/modules/conversations/helpers/actionHelpers';
import wootConstants from 'dashboard/constants/globals';

// Builds conversation and list paths that keep the active route's context.
export function useConversationRoutePath() {
  const { currentRouteName, currentParams } = useAppNavigation();

  const buildConversationPath = (
    conversationId,
    { keepFolderScope = true } = {}
  ) => {
    const name = currentRouteName.value;
    const params = currentParams.value;
    const { accountId, inbox_id: inboxId, label, teamId } = params;

    let conversationType = '';
    if (isOnMentionsView({ route: { name } })) {
      conversationType = 'mention';
    } else if (isOnParticipatingView({ route: { name } })) {
      conversationType = 'participating';
    } else if (isOnUnattendedView({ route: { name } })) {
      conversationType = 'unattended';
    }

    const isOnFolder = isOnFoldersView({ route: { name } });

    return frontendURL(
      conversationUrl({
        accountId,
        activeInbox: inboxId,
        id: conversationId,
        label,
        teamId,
        foldersId: keepFolderScope && isOnFolder ? params.id : 0,
        conversationType,
      })
    );
  };

  const buildConversationListPath = ({ keepFolderScope = true } = {}) => {
    const name = currentRouteName.value;
    const params = currentParams.value;
    const { accountId, inbox_id: inboxId, label, teamId } = params;
    const { CONVERSATION_TYPE } = wootConstants;

    let conversationType = '';
    if (isOnMentionsView({ route: { name } })) {
      conversationType = CONVERSATION_TYPE.MENTION;
    } else if (isOnParticipatingView({ route: { name } })) {
      conversationType = CONVERSATION_TYPE.PARTICIPATING;
    } else if (isOnUnattendedView({ route: { name } })) {
      conversationType = CONVERSATION_TYPE.UNATTENDED;
    }

    const isOnFolder = isOnFoldersView({ route: { name } });

    return conversationListPageURL({
      accountId,
      conversationType,
      customViewId: keepFolderScope && isOnFolder ? params.id : 0,
      inboxId,
      label,
      teamId,
    });
  };

  const isOnFolderView = computed(() =>
    isOnFoldersView({ route: { name: currentRouteName.value } })
  );

  return { buildConversationPath, buildConversationListPath, isOnFolderView };
}
