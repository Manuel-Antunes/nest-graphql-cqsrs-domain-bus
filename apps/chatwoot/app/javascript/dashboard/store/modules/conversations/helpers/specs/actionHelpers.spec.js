import {
  isOnMentionsView,
  isOnFoldersView,
  isOnParticipatingView,
} from '../actionHelpers';

const visit = path => window.history.pushState({}, '', path);

afterEach(() => visit('/'));

describe('#isOnMentionsView', () => {
  it('reads the view from the URL', () => {
    visit('/app/accounts/1/mentions/conversations');
    expect(isOnMentionsView()).toBe(true);

    visit('/app/accounts/1/conversations/9');
    expect(isOnMentionsView()).toBe(false);
  });
});

describe('#isOnFoldersView', () => {
  it('reads the view from the URL', () => {
    visit('/app/accounts/1/custom_view/3');
    expect(isOnFoldersView()).toBe(true);

    visit('/app/accounts/1/custom_view/3/conversations/9');
    expect(isOnFoldersView()).toBe(true);

    visit('/app/accounts/1/conversations/9');
    expect(isOnFoldersView()).toBe(false);
  });
});

describe('#isOnParticipatingView', () => {
  it('reads the view from the URL', () => {
    visit('/app/accounts/1/participating/conversations');
    expect(isOnParticipatingView()).toBe(true);

    visit('/app/accounts/1/participating/conversations/9');
    expect(isOnParticipatingView()).toBe(true);

    visit('/app/accounts/1/conversations/9');
    expect(isOnParticipatingView()).toBe(false);
  });
});
