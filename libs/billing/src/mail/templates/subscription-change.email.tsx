import { defineEmailTemplate } from '@nestposts/mail/email-template';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  pixelBasedPreset,
  Tailwind,
  Text,
} from 'react-email';

import type { SubscriptionChangeNotificationData } from '../../domain/billing/schemas/subscription-change-notification.schema';
import { SUBSCRIPTION_CHANGE_SUBJECTS } from '../subscription-change-subjects';

export interface SubscriptionChangeEmailProps
  extends SubscriptionChangeNotificationData {
  name: string | null;
}

const dateOf = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(iso))
    : null;

const explanation = ({
  event,
  planName,
  endsAt,
}: Omit<SubscriptionChangeNotificationData, 'url'>) => {
  const until = dateOf(endsAt);
  switch (event) {
    case 'activated':
      return `You are now on ${planName}.`;
    case 'canceled':
      return until
        ? `${planName} stays active until ${until}, and will not renew after that.`
        : `${planName} will not renew.`;
    case 'revoked':
      return `${planName} is no longer active on your account.`;
  }
};

export const SubscriptionChangeEmail = defineEmailTemplate(
  'billing/subscription-change',
  ({ name, url, ...change }: SubscriptionChangeEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{explanation(change)}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-zinc-100 py-6 font-[Helvetica,Arial,sans-serif]">
          <Container className="mx-auto max-w-[480px] rounded-[8px] bg-white p-8">
            <Heading className="m-0 mb-4 text-[22px] text-zinc-900">
              {SUBSCRIPTION_CHANGE_SUBJECTS[change.event]}
            </Heading>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {name ? `Hi ${name},` : 'Hi,'}
            </Text>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {explanation(change)}
            </Text>
            <Button
              href={url}
              className="rounded-[6px] bg-zinc-900 px-5 py-3 text-[15px] text-white no-underline"
            >
              Manage billing
            </Button>
            <Hr />
            <Text className="text-xs leading-[18px] text-zinc-400">
              You are receiving this email because of a change to your
              subscription on Nest Posts.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  ),
);
