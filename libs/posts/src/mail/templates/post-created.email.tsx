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

export interface PostCreatedEmailProps {
  authorName: string | null;
  title: string;
  url: string;
}

export const PostCreatedEmail = defineEmailTemplate(
  'posts/post-created',
  ({ authorName, title, url }: PostCreatedEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`“${title}” is live`}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-zinc-100 py-6 font-[Helvetica,Arial,sans-serif]">
          <Container className="mx-auto max-w-[480px] rounded-[8px] bg-white p-8">
            <Heading className="m-0 mb-4 text-[22px] text-zinc-900">
              Your post is live
            </Heading>
            <Text className="text-[15px] leading-6 text-zinc-700">
              {authorName ? `Hi ${authorName},` : 'Hi,'}
            </Text>
            <Text className="text-[15px] leading-6 text-zinc-700">
              “{title}” has been published and tagged. Anyone with the link can
              read it now.
            </Text>
            <Button
              href={url}
              className="rounded-[6px] bg-zinc-900 px-5 py-3 text-[15px] text-white no-underline"
            >
              Read your post
            </Button>
            <Hr />
            <Text className="text-xs leading-[18px] text-zinc-400">
              You are receiving this email because you published a post on Nest
              Posts.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  ),
);
