import types from '../../../mutation-types';
import { routeNameForPath } from 'dashboard/routes/registry';

export const setPageFilter = ({ dispatch, filter, page, markEndReached }) => {
  dispatch('conversationPage/setCurrentPage', { filter, page }, { root: true });
  if (markEndReached) {
    dispatch('conversationPage/setEndReached', { filter }, { root: true });
  }
};

export const setContacts = (commit, chatList) => {
  commit(
    `contacts/${types.SET_CONTACTS}`,
    chatList.map(chat => chat.meta.sender)
  );
};

// The current route name — reverse-matched from the URL. Previously read from
// `rootState.route.name` (vuex-router-sync), which no longer exists after the vue-router
// teardown; that made these throw on every real-time conversation-created event. The
// caller's argument (rootState / { route }) is now ignored.
export const isOnMentionsView = () => {
  const MENTION_ROUTES = [
    'conversation_mentions',
    'conversation_through_mentions',
  ];
  return MENTION_ROUTES.includes(routeNameForPath());
};

export const isOnUnattendedView = () => {
  const UNATTENDED_ROUTES = [
    'conversation_unattended',
    'conversation_through_unattended',
  ];
  return UNATTENDED_ROUTES.includes(routeNameForPath());
};

export const isOnFoldersView = () => {
  const FOLDER_ROUTES = [
    'folder_conversations',
    'conversations_through_folders',
  ];
  return FOLDER_ROUTES.includes(routeNameForPath());
};

export const buildConversationList = (
  context,
  requestPayload,
  responseData,
  filterType
) => {
  const { payload: conversationList, meta: metaData } = responseData;
  context.commit(types.SET_ALL_CONVERSATION, conversationList);
  context.dispatch('conversationStats/set', metaData);
  context.dispatch(
    'conversationLabels/setBulkConversationLabels',
    conversationList
  );
  context.commit(types.CLEAR_LIST_LOADING_STATUS);
  setContacts(context.commit, conversationList);
  setPageFilter({
    dispatch: context.dispatch,
    filter: filterType,
    page: requestPayload.page,
    markEndReached: !conversationList.length,
  });
};
