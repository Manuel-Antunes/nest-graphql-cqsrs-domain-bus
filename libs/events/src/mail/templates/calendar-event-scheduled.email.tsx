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

export interface CalendarEventScheduledEmailProps {
  name: string | null;
  title: string;
  description: string | null;
  when: string;
  responsible: string;
  url: string;
}

export const CalendarEventScheduledEmail = defineEmailTemplate(
  'events/calendar-event-scheduled',
  ({
    name,
    title,
    description,
    when,
    responsible,
    url,
  }: CalendarEventScheduledEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`${title} — ${when}`}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-zinc-100 py-6 font-[Helvetica,Arial,sans-serif]">
          <Container className="mx-auto max-w-[480px] rounded-[8px] bg-white p-8">
            <Heading className="m-0 mb-4 text-[22px] text-zinc-900">
              {title}
            </Heading>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {name ? `Hi ${name},` : 'Hi,'}
            </Text>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {responsible} put you on “{title}”. The invitation is attached:
              add it to your calendar and it will follow any change.
            </Text>
            <Text className="text-[15px] leading-6 font-semibold text-zinc-900">
              {when}
            </Text>
            {description ? (
              <Text className="text-[15px] leading-6 text-zinc-700">
                {description}
              </Text>
            ) : null}
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
