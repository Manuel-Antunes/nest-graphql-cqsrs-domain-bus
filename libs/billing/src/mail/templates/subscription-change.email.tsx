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
  Text,
} from 'react-email';

import type { SubscriptionChangeNotificationData } from '../../domain/billing/schemas/subscription-change-notification.schema';
import { SUBSCRIPTION_CHANGE_SUBJECTS } from '../subscription-change-subjects';

export interface SubscriptionChangeEmailProps
  extends SubscriptionChangeNotificationData {
  name: string | null;
}

const body = {
  backgroundColor: '#f4f4f5',
  fontFamily: 'Helvetica, Arial, sans-serif',
  padding: '24px 0',
};

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '480px',
  padding: '32px',
};

const heading = { color: '#18181b', fontSize: '22px', margin: '0 0 16px' };

const paragraph = { color: '#3f3f46', fontSize: '15px', lineHeight: '24px' };

const button = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  padding: '12px 20px',
  textDecoration: 'none',
};

const footer = { color: '#a1a1aa', fontSize: '12px', lineHeight: '18px' };

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
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>
            {SUBSCRIPTION_CHANGE_SUBJECTS[change.event]}
          </Heading>
          <Text style={paragraph}>{name ? `Hi ${name},` : 'Hi,'}</Text>
          <Text style={paragraph}>{explanation(change)}</Text>
          <Button href={url} style={button}>
            Manage billing
          </Button>
          <Hr />
          <Text style={footer}>
            You are receiving this email because of a change to your
            subscription on Nest Posts.
          </Text>
        </Container>
      </Body>
    </Html>
  ),
);
