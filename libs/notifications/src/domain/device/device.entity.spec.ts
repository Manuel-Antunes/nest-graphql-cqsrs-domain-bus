import { Device } from './device.entity';
import { InvalidDeviceException } from './exception/invalid-device.exception';

const ana = { notifiableType: 'users.User', notifiableId: 'ana' };
const bia = { notifiableType: 'users.User', notifiableId: 'bia' };
const NOW = new Date('2026-09-23T12:00:00Z');

describe('Device', () => {
  it('registers a token for its owner', () => {
    const device = Device.register(
      { token: ' fcm-token ', deviceId: 'pixel-8', platform: 'android' },
      ana,
      NOW,
    );

    expect(device).toMatchObject({
      token: 'fcm-token',
      deviceId: 'pixel-8',
      platform: 'android',
      meta: {},
      notifiableType: 'users.User',
      notifiableId: 'ana',
      createdAt: NOW,
    });
    expect(device.isOwnedBy(ana)).toBe(true);
    expect(device.isOwnedBy(bia)).toBe(false);
  });

  it('refuses a device with no token', () => {
    expect(() =>
      Device.register({ token: '', deviceId: 'x' }, ana, NOW),
    ).toThrow(InvalidDeviceException);
  });

  it('moves to whoever signs in on the same installation', () => {
    const device = Device.register(
      { token: 'fcm-token', deviceId: 'pixel-8' },
      ana,
      NOW,
    );
    const later = new Date('2026-09-24T12:00:00Z');

    device.reassign(
      { token: 'fcm-token', deviceId: 'pixel-8', platform: 'web' },
      bia,
      later,
    );

    expect(device.isOwnedBy(bia)).toBe(true);
    expect(device.platform).toBe('web');
    expect(device.updatedAt).toEqual(later);
  });
});
