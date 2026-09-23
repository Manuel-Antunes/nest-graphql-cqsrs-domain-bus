import { ref } from '@mikro-orm/core';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { metadataOnly } from '@nestposts/database/testing';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';

import { OrganizationEntities } from '../../infrastructure/persistence/organization-entities';
import { Invitation } from './invitation.entity';
import { Member } from './member.entity';
import { Organization } from './organization.entity';
import {
  ACCEPTED_INVITATION,
  PENDING_INVITATION,
} from './schemas/invitation-status.schema';
import { InvitationId } from './vo/invitation-id';
import { InvitationStatus } from './vo/invitation-status';
import { MemberId } from './vo/member-id';
import { MemberRole } from './vo/member-role';
import { OrganizationId } from './vo/organization-id';
import { OrganizationName } from './vo/organization-name';
import { OrganizationSlug } from './vo/organization-slug';

describe('the organization domain', () => {
  let orm: AnyMikroORM;

  const ORGANIZATION = OrganizationId.parse('org_1');
  const OTHER_ORGANIZATION = OrganizationId.parse('org_2');
  const CREDENTIAL = CredentialId.parse('cred_1');
  const NOW = new Date('2026-09-21T12:00:00.000Z');

  beforeAll(async () => {
    orm = await metadataOnly(OrganizationEntities.withAuth());
  });

  afterAll(() => orm.close(true));

  const aMember = (
    role: string,
    organization = ORGANIZATION,
    user = CREDENTIAL,
  ): Member => {
    const member = new Member();
    member.id = MemberId.parse('member_1');
    member.role = MemberRole.parse(role);
    member.organization = ref(Organization, organization as never);
    member.user = ref(AuthUser, user as never);
    member.createdAt = NOW;
    return member;
  };

  describe('the slug is an address, and the schema says so', () => {
    it('normalizes case and refuses what a URL could not carry', () => {
      expect(OrganizationSlug.parse('  Acme-Corp  ').value).toBe('acme-corp');
      expect(OrganizationSlug.safeParse('acme corp').success).toBe(false);
      expect(OrganizationSlug.safeParse('-acme').success).toBe(false);
      expect(OrganizationSlug.safeParse('acme--corp').success).toBe(false);
    });
  });

  describe('a member answers what it may do, not what it is called', () => {
    it('an owner is an admin; an admin is not an owner', () => {
      expect(aMember('owner').isOwner()).toBe(true);
      expect(aMember('owner').isAdmin()).toBe(true);
      expect(aMember('admin').isAdmin()).toBe(true);
      expect(aMember('admin').isOwner()).toBe(false);
      expect(aMember('member').isAdmin()).toBe(false);
    });

    it('the role is a value object, so it compares by value and normalizes', () => {
      const member = aMember('  OWNER  ');

      expect(member.role.value).toBe('owner');
      expect(member.hasRole('owner')).toBe(true);
      expect(member.hasRole(MemberRole.parse('owner'))).toBe(true);
    });

    it('membership is read off the reference, without loading it', () => {
      const member = aMember('member');

      expect(member.belongsTo(ORGANIZATION)).toBe(true);
      expect(member.belongsTo(OTHER_ORGANIZATION)).toBe(false);
      expect(member.identifies(CREDENTIAL)).toBe(true);
      expect(member.identifies(CredentialId.parse('cred_2'))).toBe(false);
    });
  });

  describe('an organization is identified by either of its two names', () => {
    it('compares by id and by slug', () => {
      const organization = new Organization();
      organization.id = ORGANIZATION;
      organization.name = OrganizationName.parse('Acme');
      organization.slug = OrganizationSlug.parse('acme');

      expect(organization.is(ORGANIZATION)).toBe(true);
      expect(organization.is('org_1')).toBe(true);
      expect(organization.is(OTHER_ORGANIZATION)).toBe(false);
      expect(organization.isAddressedBy('acme')).toBe(true);
    });
  });

  describe('an invitation is open, expired or settled — never merely pending', () => {
    const anInvitation = (status: string, expiresAt: Date): Invitation => {
      const invitation = new Invitation();
      invitation.id = InvitationId.parse('invite_1');
      invitation.email = Email.parse('manuel@example.com');
      invitation.status = InvitationStatus.parse(status);
      invitation.expiresAt = expiresAt;
      invitation.createdAt = NOW;
      invitation.organization = ref(Organization, ORGANIZATION as never);
      invitation.inviter = ref(AuthUser, CREDENTIAL as never);
      return invitation;
    };

    const later = new Date(NOW.getTime() + 60_000);
    const earlier = new Date(NOW.getTime() - 60_000);

    it('pending and unexpired is open', () => {
      expect(anInvitation(PENDING_INVITATION, later).isOpen(NOW)).toBe(true);
      expect(anInvitation(PENDING_INVITATION, later).hasExpired(NOW)).toBe(
        false,
      );
    });

    it('pending and past its date is expired, and no longer open', () => {
      expect(anInvitation(PENDING_INVITATION, earlier).isOpen(NOW)).toBe(false);
      expect(anInvitation(PENDING_INVITATION, earlier).hasExpired(NOW)).toBe(
        true,
      );
    });

    it('a settled invitation is neither open nor expired, whatever its date says', () => {
      const accepted = anInvitation(ACCEPTED_INVITATION, earlier);

      expect(accepted.isOpen(NOW)).toBe(false);
      expect(accepted.hasExpired(NOW)).toBe(false);
      expect(accepted.status.isAccepted()).toBe(true);
    });

    it('the address it was sent to compares as a value, normalization included', () => {
      const invitation = anInvitation(PENDING_INVITATION, later);

      expect(invitation.wasSentTo(Email.parse('  MANUEL@example.com '))).toBe(
        true,
      );
      expect(invitation.wasSentTo(Email.parse('outro@example.com'))).toBe(
        false,
      );
    });
  });
});
