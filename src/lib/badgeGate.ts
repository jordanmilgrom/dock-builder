/**
 * "Powered by" badge gate (§10 #2 white-label).
 *
 * The badge is hidden only when the tenant is BOTH entitled to remove it (Pro+,
 * `entitlements.removeBadge`) AND has toggled it off in branding
 * (`branding.removeBadge`). A Starter tenant always shows the badge regardless of
 * its branding setting. Pure so the layout (hosted page + embed) and tests share
 * one rule.
 */

export function shouldShowBadge(
  entitlements: { removeBadge: boolean } | null | undefined,
  branding: { removeBadge: boolean } | null | undefined,
): boolean {
  return !(entitlements?.removeBadge && branding?.removeBadge);
}
