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

export interface CalendarEventScheduledEmailProps {
  name: string | null;
  title: string;
  description: string | null;
  when: string;
  responsible: string;
  url: string;
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

const when = { ...paragraph, color: '#18181b', fontWeight: 600 };

const button = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  padding: '12px 20px',
  textDecoration: 'none',
};

const footer = { color: '#a1a1aa', fontSize: '12px', lineHeight: '18px' };

export const CalendarEventScheduledEmail = defineEmailTemplate(
  'events/calendar-event-scheduled',
  ({
    name,
    title,
    description,
    when: period,
    responsible,
    url,
  }: CalendarEventScheduledEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`${title} — ${period}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{title}</Heading>
          <Text style={paragraph}>{name ? `Hi ${name},` : 'Hi,'}</Text>
          <Text style={paragraph}>
            {responsible} put you on “{title}”. The invitation is attached: add
            it to your calendar and it will follow any change.
          </Text>
          <Text style={when}>{period}</Text>
          {description ? <Text style={paragraph}>{description}</Text> : null}
          <Button href={url} style={button}>
            Open the calendar
          </Button>
          <Hr />
          <Text style={footer}>
            You are receiving this email because you are attending an event on
            Nest Posts.
          </Text>
        </Container>
      </Body>
    </Html>
  ),
);
