import type { ReactNode } from 'react';
import { cn } from '@nestposts/auth/mail/components/cn';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  pixelBasedPreset,
  Section,
  Tailwind,
  Text,
} from 'react-email';

import {
  type EmailClassNames,
  type EmailColors,
  EmailStyles,
} from './email-styles';

const organizationInvitationEmailLocalization = {
  YOU_RE_INVITED_TO_ORGANIZATION: "You're invited to {organizationName}",
  YOU_RE_INVITED: "You're invited",
  LOGO: 'Logo',
  ORGANIZATION_LOGO: 'Organization logo',
  INVITED_TO_JOIN_ORGANIZATION:
    '{inviterName} ({inviterEmail}) has invited you to join {organizationName} on {appName} as a {role}.',
  ACCEPT_INVITATION: 'Accept invitation',
  VIEW_INVITATION: 'View invitation',
  OR_COPY_AND_PASTE_URL: 'Or copy and paste this URL into your browser:',
  THIS_INVITATION_EXPIRES_IN_HOURS:
    'This invitation expires in {expirationHours} hours.',
  EMAIL_SENT_BY: 'Email sent by {appName}.',
  IF_YOU_DIDNT_EXPECT_THIS_INVITATION:
    "If you didn't expect this invitation, you can safely ignore this email.",
  POWERED_BY_BETTER_AUTH: 'Powered by {betterAuth}',
};

export type OrganizationInvitationEmailLocalization =
  typeof organizationInvitationEmailLocalization;

export interface OrganizationInvitationEmailProps {
  url: string;
  email?: string;
  inviterName?: string;
  inviterEmail?: string;
  organizationName?: string;
  organizationLogoURL?: string | { light: string; dark: string };
  role?: string;
  appName?: string;
  expirationHours?: number;
  logoURL?: string | { light: string; dark: string };
  classNames?: EmailClassNames;
  colors?: EmailColors;
  poweredBy?: boolean;
  darkMode?: boolean;
  head?: ReactNode;
  localization?: Partial<OrganizationInvitationEmailLocalization>;
}

export const OrganizationInvitationEmail = ({
  url,
  email,
  inviterName,
  inviterEmail,
  organizationName,
  organizationLogoURL,
  role,
  appName,
  expirationHours = 48,
  logoURL,
  colors,
  classNames,
  darkMode = true,
  poweredBy,
  head,
  ...props
}: OrganizationInvitationEmailProps) => {
  const localization = {
    ...OrganizationInvitationEmail.localization,
    ...props.localization,
  };

  const previewText = organizationName
    ? localization.YOU_RE_INVITED_TO_ORGANIZATION.replace(
        '{organizationName}',
        organizationName,
      )
    : localization.YOU_RE_INVITED;

  return (
    <Html>
      <Head>
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />

        <EmailStyles colors={colors} darkMode={darkMode} />

        {head}
      </Head>

      <Preview>{previewText}</Preview>

      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className={cn('bg-background font-sans', classNames?.body)}>
          <Container
            className={cn(
              'mx-auto my-auto max-w-xl px-2 py-10',
              classNames?.container,
            )}
          >
            <Section
              className={cn(
                'bg-card text-card-foreground rounded-none border border-border p-8',
                classNames?.card,
              )}
            >
              {logoURL &&
                (typeof logoURL === 'string' ? (
                  <Img
                    src={logoURL}
                    width={48}
                    height={48}
                    alt={appName || localization.LOGO}
                    className={cn('mx-auto mb-8', classNames?.logo)}
                  />
                ) : (
                  <>
                    <Img
                      src={logoURL.light}
                      width={48}
                      height={48}
                      alt={appName || localization.LOGO}
                      className={cn(
                        'mx-auto mb-8 logo-light',
                        classNames?.logo,
                      )}
                    />
                    <Img
                      src={logoURL.dark}
                      width={48}
                      height={48}
                      alt={appName || localization.LOGO}
                      className={cn(
                        'hidden mx-auto mb-8 logo-dark',
                        classNames?.logo,
                      )}
                    />
                  </>
                ))}

              <Heading
                className={cn(
                  'm-0 mb-5 text-2xl font-semibold',
                  classNames?.title,
                )}
              >
                {organizationName
                  ? localization.YOU_RE_INVITED_TO_ORGANIZATION.replace(
                      '{organizationName}',
                      organizationName,
                    )
                  : localization.YOU_RE_INVITED}
              </Heading>

              {organizationLogoURL &&
                (typeof organizationLogoURL === 'string' ? (
                  <Img
                    src={organizationLogoURL}
                    width={56}
                    height={56}
                    alt={organizationName || localization.ORGANIZATION_LOGO}
                    className={cn('mb-5 rounded-md', classNames?.logo)}
                  />
                ) : (
                  <>
                    <Img
                      src={organizationLogoURL.light}
                      width={56}
                      height={56}
                      alt={organizationName || localization.ORGANIZATION_LOGO}
                      className={cn(
                        'mb-5 rounded-md logo-light',
                        classNames?.logo,
                      )}
                    />
                    <Img
                      src={organizationLogoURL.dark}
                      width={56}
                      height={56}
                      alt={organizationName || localization.ORGANIZATION_LOGO}
                      className={cn(
                        'hidden mb-5 rounded-md logo-dark',
                        classNames?.logo,
                      )}
                    />
                  </>
                ))}

              <Text
                className={cn('m-0 text-sm font-normal', classNames?.content)}
              >
                {(() => {
                  let text = localization.INVITED_TO_JOIN_ORGANIZATION.replace(
                    '{appName}',
                    appName || '',
                  )
                    .replace('{organizationName}', organizationName || '')
                    .replace('{role}', role || '');

                  if (!inviterName && !inviterEmail) {
                    text = text
                      .replace('{inviterName} ({inviterEmail})', 'Someone')
                      .replace('{inviterName}', 'Someone')
                      .replace('({inviterEmail})', '');
                  }

                  const [beforeInviterName, afterInviterName] =
                    text.split('{inviterName}');

                  const renderInviterEmail = (segment: string) => {
                    const [beforeInviterEmail, afterInviterEmail] =
                      segment.split('{inviterEmail}');

                    if (!inviterEmail) {
                      return segment
                        .replace('({inviterEmail})', '')
                        .replace('{inviterEmail}', '')
                        .replace(/\s{2,}/g, ' ')
                        .replace(' .', '.');
                    }

                    return (
                      <>
                        {beforeInviterEmail}
                        <Link
                          href={`mailto:${inviterEmail}`}
                          className="text-primary font-medium"
                        >
                          {inviterEmail}
                        </Link>
                        {afterInviterEmail}
                      </>
                    );
                  };

                  if (!inviterName) {
                    return renderInviterEmail(
                      text
                        .replace('{inviterName}', '')
                        .replace(/\s{2,}/g, ' ')
                        .replace(' .', '.'),
                    );
                  }

                  return (
                    <>
                      {beforeInviterName}
                      <span className="font-medium">{inviterName}</span>
                      {renderInviterEmail(afterInviterName ?? '')}
                    </>
                  );
                })()}
              </Text>

              <Section className="my-6">
                <Button
                  href={url}
                  className={cn(
                    'inline-block whitespace-nowrap rounded-none text-sm font-medium py-2.5 px-6 bg-primary text-primary-foreground no-underline',
                    classNames?.button,
                  )}
                >
                  {localization.ACCEPT_INVITATION}
                </Button>
              </Section>

              <Text
                className={cn(
                  'm-0 mb-3 text-xs text-muted-foreground',
                  classNames?.description,
                )}
              >
                {localization.OR_COPY_AND_PASTE_URL}
              </Text>

              <Link
                className={cn(
                  'break-all text-xs text-primary',
                  classNames?.link,
                )}
                href={url}
              >
                {url}
              </Link>

              <Hr
                className={cn(
                  'my-6 w-full border border-solid border-border',
                  classNames?.separator,
                )}
              />

              {expirationHours || appName ? (
                <Text
                  className={cn(
                    'm-0 mb-3 text-xs text-muted-foreground',
                    classNames?.description,
                  )}
                >
                  {expirationHours
                    ? localization.THIS_INVITATION_EXPIRES_IN_HOURS.replace(
                        '{expirationHours}',
                        expirationHours.toString(),
                      )
                    : null}
                  {appName && (
                    <>
                      {expirationHours ? ' ' : ''}
                      {localization.EMAIL_SENT_BY.replace('{appName}', appName)}
                    </>
                  )}
                </Text>
              ) : null}

              <Text
                className={cn(
                  'm-0 text-xs text-muted-foreground',
                  classNames?.description,
                )}
              >
                {localization.IF_YOU_DIDNT_EXPECT_THIS_INVITATION}
              </Text>

              {poweredBy && (
                <Text
                  className={cn(
                    'm-0 mt-4 text-center text-[11px] text-muted-foreground',
                    classNames?.poweredBy,
                  )}
                >
                  {(() => {
                    const [beforeBetterAuth, afterBetterAuth] =
                      localization.POWERED_BY_BETTER_AUTH.split('{betterAuth}');

                    return (
                      <>
                        {beforeBetterAuth}
                        <Link
                          href="https://better-auth.com"
                          className={cn(
                            'text-primary underline',
                            classNames?.link,
                          )}
                        >
                          better-auth
                        </Link>
                        {afterBetterAuth}
                      </>
                    );
                  })()}
                </Text>
              )}
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

OrganizationInvitationEmail.localization =
  organizationInvitationEmailLocalization;

OrganizationInvitationEmail.PreviewProps = {
  url: 'https://better-auth-ui.com/auth/accept-invitation?invitationId=example',
  email: 'm@example.com',
  inviterName: 'Jane Doe',
  inviterEmail: 'jane@example.com',
  organizationName: 'Acme Inc.',
  role: 'member',
  appName: 'Better Auth',
  expirationHours: 48,
  darkMode: true,
} as OrganizationInvitationEmailProps;

export default OrganizationInvitationEmail;
