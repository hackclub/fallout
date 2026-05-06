// Builds a deep link to an HCB card grant using the shared `hcb_host` prop.
// HCB's web route mounts card grants at `/grants/:hashid` (see
// hcb/app/controllers/card_grants_controller.rb: find_by_hashid!), which is
// the raw hashid — the `cdg_` PublicIdentifiable prefix is only used by the
// JSON API. Strip any prefix before the last underscore so ids of the form
// `cdg_XXXXX` or our dev stub `stub_cg_XXXXX` both resolve.
export function hcbGrantUrl(hcbHost: string | undefined, hcbId: string | null | undefined): string | null {
  if (!hcbHost || !hcbId) return null
  const hashid = hcbId.includes('_') ? hcbId.split('_').pop() : hcbId
  return `${hcbHost.replace(/\/$/, '')}/grants/${hashid}`
}
