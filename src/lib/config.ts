/**
 * The host this app was pinned to before the site became a login field.
 *
 * Its ONLY remaining job is to tell the storage migration which tenant a legacy
 * install's flat keys belong to. useLogin passed this host unconditionally and no
 * code path ever stored another, so every pre-migration install provably belongs
 * to it — that makes this a fact about the old builds, not a default for new ones.
 *
 * Nothing else may read it. New logins get their host from the user.
 */
export const LEGACY_PINNED_HOST = 'xflora.upande.com';
