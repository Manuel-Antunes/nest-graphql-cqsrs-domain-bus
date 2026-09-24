import { Mail } from '@nestposts/mail/mail';

import { Notification } from '../notification/notification';
import { NotificationType } from '../notification/notification-type';
import type { MailNotification } from './mail-notification';
import { isMailNotification } from './mail-notification';
import type { PushNotification } from './push-notification';
import { isPushNotification } from './push-notification';

class NoteMail extends Mail {
  prepare() {
    this.message.to('ana@example.com').html('<p>note</p>');
  }
}

@NotificationType('spec.MailedNote')
class MailedNote extends Notification implements MailNotification {
  constructor() {
    super({});
  }

  toMail() {
    return new NoteMail();
  }
}

@NotificationType('spec.PushedNote')
class PushedNote extends Notification implements PushNotification {
  constructor() {
    super({});
  }

  toPush() {
    return { notification: { title: 'Note', body: 'pushed' } };
  }
}

@NotificationType('spec.StoredNote')
class StoredNote extends Notification {
  constructor() {
    super({});
  }
}

describe('what a notification can be told as', () => {
  it('is an email when it implements MailNotification', () => {
    expect(isMailNotification(new MailedNote())).toBe(true);
    expect(isMailNotification(new PushedNote())).toBe(false);
    expect(isMailNotification(new StoredNote())).toBe(false);
  });

  it('is a push when it implements PushNotification', () => {
    expect(isPushNotification(new PushedNote())).toBe(true);
    expect(isPushNotification(new MailedNote())).toBe(false);
    expect(isPushNotification(new StoredNote())).toBe(false);
  });

  it('keeps what it implements once it is rebuilt from its record', () => {
    expect(
      isMailNotification(Notification.restore(new MailedNote().record)),
    ).toBe(true);
  });
});
