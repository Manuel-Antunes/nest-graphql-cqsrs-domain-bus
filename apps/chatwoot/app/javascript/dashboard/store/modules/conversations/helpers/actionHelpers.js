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
// teardown; that made these throw on every real-time conversation-created event. A
// `{ route }` argument still names the route; rootState carries none.
const routeNameOf = context => context?.route?.name ?? routeNameForPath();

export const isOnMentionsView = context => {
  const MENTION_ROUTES = [
    'conversation_mentions',
    'conversation_through_mentions',
  ];
  return MENTION_ROUTES.includes(routeNameOf(context));
};

export const isOnUnattendedView = context => {
  const UNATTENDED_ROUTES = [
    'conversation_unattended',
    'conversation_through_unattended',
  ];
  return UNATTENDED_ROUTES.includes(routeNameOf(context));
};

export const isOnParticipatingView = context => {
  const PARTICIPATING_ROUTES = [
    'conversation_participating',
    'conversation_through_participating',
  ];
  return PARTICIPATING_ROUTES.includes(routeNameOf(context));
};

export const isOnFoldersView = context => {
  const FOLDER_ROUTES = [
    'folder_conversations',
    'conversations_through_folders',
  ];
  return FOLDER_ROUTES.includes(routeNameOf(context));
};

export const buildConversationList = (
  context,
  requestPayload,
  responseData,
  filterType,
  { replaceExisting = false, countRequest } = {}
) => {
  const { payload: conversationList, meta: metaData } = responseData;
  if (replaceExisting) {
    context.dispatch('conversationPage/reset', null, { root: true });
    context.commit(types.REPLACE_CONVERSATION_LIST, conversationList);
  } else {
    context.commit(types.SET_ALL_CONVERSATION, conversationList);
  }
  context.dispatch('conversationStats/set', {
    meta: metaData,
    request: countRequest,
  });
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
