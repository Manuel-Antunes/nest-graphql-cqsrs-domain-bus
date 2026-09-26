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

export interface CalendarEventRescheduledEmailProps {
  name: string | null;
  title: string;
  when: string;
  previously: string;
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

const previously = {
  ...paragraph,
  color: '#a1a1aa',
  textDecoration: 'line-through',
};

const button = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  padding: '12px 20px',
  textDecoration: 'none',
};

const footer = { color: '#a1a1aa', fontSize: '12px', lineHeight: '18px' };

export const CalendarEventRescheduledEmail = defineEmailTemplate(
  'events/calendar-event-rescheduled',
  ({
    name,
    title,
    when: period,
    previously: before,
    url,
  }: CalendarEventRescheduledEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`${title} moved to ${period}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{title} was rescheduled</Heading>
          <Text style={paragraph}>{name ? `Hi ${name},` : 'Hi,'}</Text>
          <Text style={paragraph}>
            “{title}” has a new time. The updated invitation is attached, and it
            replaces the one already on your calendar.
          </Text>
          <Text style={when}>{period}</Text>
          <Text style={previously}>{before}</Text>
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
