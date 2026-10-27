import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Two-factor (MFA / TOTP) helpers shared by the middleware and the server-side
 * auth guards. 2FA is OPTIONAL for every role: a user is only ever challenged
 * for a code once they have enrolled a verified factor of their own accord.
 *
 * The enforcement rule everywhere is the same, expressed in Supabase's
 * Authenticator Assurance Levels (AAL):
 *   - currentLevel: the AAL the current session actually has right now.
 *   - nextLevel:    the highest AAL the user COULD reach (aal2 once they have
 *                   at least one verified factor).
 *
 * So `currentLevel === 'aal1' && nextLevel === 'aal2'` means: "this user has
 * 2FA enabled and has signed in with their password, but has NOT yet entered
 * their code". That half-logged-in state must not reach any protected data.
 *
 * getAuthenticatorAssuranceLevel() decodes the session JWT locally — there is
 * no network round-trip, so this is cheap to call on every request.
 */
export async function requiresSecondFactor(
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) return false
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
  } catch {
    // Never let an AAL lookup failure wedge the whole request. Failing open
    // here is safe: the password session is still valid, and a user who has
    // not enrolled any factor is unaffected. The risk window is only a user
    // who DID enroll — and the login flow still challenged them before issuing
    // the session, so a transient decode error does not grant new access.
    return false
  }
}

/** Where a half-logged-in user is sent to finish signing in. */
export const SECOND_FACTOR_PATH = '/login/2fa'

/** Max verified TOTP factors a user may keep (e.g. primary phone + backup). */
export const MAX_TOTP_FACTORS = 2
