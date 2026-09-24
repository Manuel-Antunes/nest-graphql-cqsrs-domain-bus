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

export interface PostCreatedEmailProps {
  authorName: string | null;
  title: string;
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

const button = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  padding: '12px 20px',
  textDecoration: 'none',
};

const footer = { color: '#a1a1aa', fontSize: '12px', lineHeight: '18px' };

export const PostCreatedEmail = defineEmailTemplate(
  'posts/post-created',
  ({ authorName, title, url }: PostCreatedEmailProps) => (
    <Html lang="en">
      <Head />
      <Preview>{`“${title}” is live`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your post is live</Heading>
          <Text style={paragraph}>
            {authorName ? `Hi ${authorName},` : 'Hi,'}
          </Text>
          <Text style={paragraph}>
            “{title}” has been published and tagged. Anyone with the link can
            read it now.
          </Text>
          <Button href={url} style={button}>
            Read your post
          </Button>
          <Hr />
          <Text style={footer}>
            You are receiving this email because you published a post on Nest
            Posts.
          </Text>
        </Container>
      </Body>
    </Html>
  ),
);
