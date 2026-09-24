import { NotificationId } from './notification-id';

describe('NotificationId', () => {
  it('derives the same version-5 id from the same parts', () => {
    const id = NotificationId.derive(
      'posts.PostCreated',
      'post-1',
      'users.User',
      'user-1',
    );

    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(
      NotificationId.derive(
        'posts.PostCreated',
        'post-1',
        'users.User',
        'user-1',
      ).equals(id),
    ).toBe(true);
  });

  it('keeps the parts apart, so shifting a separator names another notification', () => {
    expect(
      NotificationId.derive('ab', 'c').equals(NotificationId.derive('a', 'bc')),
    ).toBe(false);
  });
});
