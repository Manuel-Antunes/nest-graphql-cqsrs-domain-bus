import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { firebasePushOptionsFromEnv } from '@nestposts/notifications/infrastructure/push/firebase.options';

export const firebaseConfig = registerAs('firebase', () => ({
  push: firebasePushOptionsFromEnv(process.env),
}));

export type FirebaseConfig = ConfigType<typeof firebaseConfig>;
