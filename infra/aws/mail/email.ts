/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **What `apps/notificator` sends email as**: an SES identity, and the IAM to send through it for
 * whatever links it.
 *
 * `MAIL_SENDER` comes from the `.env` at the root, like the telemetry destination, and a missing one
 * stops the deploy. It is an address or a domain, and it is used one of two ways:
 *
 * - **Created here** (the default): an `sst.aws.Email`. An address is verified by clicking the link
 *   SES mails to it on the first deploy; a domain needs its DNS records.
 * - **Referenced** (`MAIL_SENDER_EXISTING=true`): an identity that is already verified in the account
 *   and managed somewhere else. Creating it again fails with `AlreadyExistsException`, and importing
 *   it would let `sst remove` delete an identity other things send through — so it is not a resource
 *   of this stack at all. What links it gets `ses:SendEmail` and `ses:SendRawEmail` on its ARN.
 *
 * Until the account leaves the SES sandbox, mail is only DELIVERED to verified addresses; sending to
 * anyone else fails, and the notificator retries it into the dead-letter queue.
 */
const sender = process.env.MAIL_SENDER;
if (!sender) {
  throw new Error(
    'MAIL_SENDER is not set. It comes from the .env at the root of the repository (see ' +
      '.env.example): the address, or the domain, the notificator sends email as.',
  );
}

const existing = process.env.MAIL_SENDER_EXISTING === 'true';

const identityArn = $interpolate`arn:aws:ses:${aws.getRegionOutput().name}:${aws.getCallerIdentityOutput().accountId}:identity/${sender}`;

const created = existing ? undefined : new sst.aws.Email('Email', { sender });

export const email: sst.Linkable<{ sender: string }> | sst.aws.Email =
  created ??
  new sst.Linkable('Email', {
    properties: { sender },
    include: [
      sst.aws.permission({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: [identityArn],
      }),
    ],
  });

export const mailSender = created ? created.sender : $util.output(sender);

/** The `From` of every email: the sender itself, or an address at the sender's domain. */
export const mailFrom = mailSender.apply((identity) =>
  identity.includes('@') ? identity : `Nest Posts <no-reply@${identity}>`,
);
