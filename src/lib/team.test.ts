import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, makeTenant } from "@/test/db";
import { roleCanAdminister } from "@/lib/authz";
import { acceptInvitation, inviteMember } from "@/lib/team";

describe("team / multi-user (§5.6)", () => {
  beforeEach(resetDb);

  it("invite → accept creates a builder_member on the tenant", async () => {
    const scope = await makeTenant("team-co", { tier: "pro" });
    const invite = await inviteMember(scope.tenantId, "Mate@Example.com");
    if ("error" in invite) throw new Error(invite.error);
    expect(invite.email).toBe("mate@example.com");

    const accepted = await acceptInvitation(invite.token);
    if ("error" in accepted) throw new Error(accepted.error);
    expect(accepted.role).toBe("builder_member");
    expect(accepted.tenantId).toBe(scope.tenantId);

    const user = await prisma.user.findFirstOrThrow({ where: { id: accepted.userId } });
    expect(user.role).toBe("builder_member");
    expect(user.tenantId).toBe(scope.tenantId);
  });

  it("builder_member cannot administer billing/team/custom-domain (role predicate)", () => {
    expect(roleCanAdminister("builder_admin")).toBe(true);
    expect(roleCanAdminister("builder_member")).toBe(false);
    expect(roleCanAdminister("platform_admin")).toBe(false);
  });

  it("rejects bad email, duplicate member, expired + reused tokens", async () => {
    const scope = await makeTenant("team-co-2", { tier: "pro" });
    expect(await inviteMember(scope.tenantId, "nope")).toEqual({ error: "invalid_email" });

    const expired = await inviteMember(scope.tenantId, "late@example.com", {
      now: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    if ("error" in expired) throw new Error(expired.error);
    expect(await acceptInvitation(expired.token)).toEqual({ error: "expired" });

    const ok = await inviteMember(scope.tenantId, "good@example.com");
    if ("error" in ok) throw new Error(ok.error);
    await acceptInvitation(ok.token);
    // Reuse is rejected, and re-inviting an existing member is blocked.
    expect(await acceptInvitation(ok.token)).toEqual({ error: "already_accepted" });
    expect(await inviteMember(scope.tenantId, "good@example.com")).toEqual({ error: "already_member" });
  });
});
