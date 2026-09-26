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

export interface CalendarEventRescheduledEmailProps {
  name: string | null;
  title: string;
  when: string;
  previously: string;
  url: string;
}

export const CalendarEventRescheduledEmail = defineEmailTemplate(
  'events/calendar-event-rescheduled',
  ({
    name,
    title,
    when,
    previously,
    url,
  }: CalendarEventRescheduledEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`${title} moved to ${when}`}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-zinc-100 py-6 font-[Helvetica,Arial,sans-serif]">
          <Container className="mx-auto max-w-[480px] rounded-[8px] bg-white p-8">
            <Heading className="m-0 mb-4 text-[22px] text-zinc-900">
              {title} was rescheduled
            </Heading>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {name ? `Hi ${name},` : 'Hi,'}
            </Text>
            <Text className="text-[15px] leading-6 text-zinc-700">
              “{title}” has a new time. The updated invitation is attached, and
              it replaces the one already on your calendar.
            </Text>
            <Text className="text-[15px] leading-6 font-semibold text-zinc-900">
              {when}
            </Text>
            <Text className="text-[15px] leading-6 text-zinc-400 line-through">
              {previously}
            </Text>
            <Button
              href={url}
              className="rounded-[6px] bg-zinc-900 px-5 py-3 text-[15px] text-white no-underline"
            >
              Open the calendar
            </Button>
            <Hr />
            <Text className="text-xs leading-[18px] text-zinc-400">
              You are receiving this email because you are attending an event on
              Nest Posts.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  ),
);
