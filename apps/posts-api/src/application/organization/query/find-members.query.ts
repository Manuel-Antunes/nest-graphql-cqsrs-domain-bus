import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import { MemberRepository } from '@nestposts/organizations/domain/organization/member.repository';
import { TenantOrganizations } from '@nestposts/organizations/infrastructure/tenancy/tenant-organizations.service';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

export namespace FindMembersQuery {
  export class FindMembers extends Query<User[]> {
    constructor(
      readonly caller: User,
      readonly tenant: string,
    ) {
      super();
    }
  }

  @QueryHandler(FindMembers)
  export class Handler implements IQueryHandler<FindMembers> {
    constructor(
      private readonly tenants: TenantOrganizations,
      private readonly members: MemberRepository,
      private readonly provisioning: UserProvisioning,
    ) {}

    async execute({ caller, tenant }: FindMembers): Promise<User[]> {
      const organization = await this.tenants.of(tenant);
      if (!organization) {
        return [caller];
      }
      const users: User[] = [];
      for (const member of await this.members.findAllIn(organization.id)) {
        users.push(await this.provisioning.provision(member.user.id));
      }
      return users;
    }
  }
}
