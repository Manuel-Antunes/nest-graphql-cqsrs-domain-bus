import type { FirebaseCredentials } from './schemas/firebase-env.schema';
import { FirebaseEnvSchema } from './schemas/firebase-env.schema';

/** The service account Firebase Cloud Messaging is reached with. */
export interface FirebasePushOptions {
  credentials: FirebaseCredentials;
}

/** {@link FirebasePushOptions} from `FIREBASE_CREDENTIALS` — the service account's JSON — or `null`. */
export const firebasePushOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): FirebasePushOptions | null => {
  const { FIREBASE_CREDENTIALS } = FirebaseEnvSchema.parse(env);
  return FIREBASE_CREDENTIALS ? { credentials: FIREBASE_CREDENTIALS } : null;
};
