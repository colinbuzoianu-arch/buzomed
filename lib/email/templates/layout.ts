/**
 * Shared HTML email layout.
 *
 * Email HTML is a different beast from web HTML — Outlook in particular
 * runs on Word's HTML rendering engine, which is hostile to modern CSS.
 * Rules of thumb baked into this layout:
 *
 * - Inline CSS only (no <style> blocks, no external stylesheets)
 * - Tables for layout (yes, like 2003)
 * - Web-safe fonts only (Arial, Helvetica) — custom fonts will silently
 *   fall back to serif in Outlook
 * - Hex colors only (no HSL, no CSS variables)
 * - No flexbox, no grid
 * - Image dimensions hardcoded as width/height attributes (Outlook
 *   ignores CSS dimensions on img)
 *
 * The content slot is a single column, max-width 600px — the email
 * standard width. Anything wider gets cut off in many clients.
 */

interface LayoutProps {
  /** Pre-escaped HTML body content (template is responsible for escaping) */
  body: string
  /** Footer text, plain string */
  footerText: string
  /** Preheader text — first line of preview shown in inbox lists */
  preheader: string
}

const COLORS = {
  blue: '#1d4f99', // matches --buzomed-blue from globals.css
  teal: '#28a3a3', // matches --buzomed-teal
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  white: '#ffffff',
} as const

export function renderEmailLayout({
  body,
  footerText,
  preheader,
}: LayoutProps): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Buzomed</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: Arial, Helvetica, sans-serif; color: ${COLORS.text};">

<!-- Preheader (hidden, but shows as preview text in inbox) -->
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
${escapeHtml(preheader)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${COLORS.background};">
  <tr>
    <td align="center" style="padding: 32px 16px;">

      <!-- Main container -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: ${COLORS.white}; border: 1px solid ${COLORS.border}; border-radius: 8px;">

        <!-- Header with logo wordmark -->
        <tr>
          <td style="padding: 24px 32px; border-bottom: 1px solid ${COLORS.border};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size: 20px; font-weight: 700; color: ${COLORS.blue}; letter-spacing: -0.5px;">
                  Buzomed
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: ${COLORS.text};">
${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 24px 32px; border-top: 1px solid ${COLORS.border}; font-size: 12px; line-height: 1.5; color: ${COLORS.textMuted};">
${escapeHtml(footerText)}
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`
}

/**
 * Minimal HTML escaping for user-provided strings interpolated into
 * template HTML. Templates should escape any dynamic value that isn't
 * already a URL or pre-rendered HTML fragment.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render a button-style link inline in emails. Uses the bulletproof
 * VML+table pattern that works in Outlook.
 */
export function renderButton(text: string, url: string): string {
  const safeText = escapeHtml(text)
  const safeUrl = escapeHtml(url)
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
  <tr>
    <td style="border-radius: 6px; background-color: ${COLORS.blue};">
      <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: ${COLORS.white}; text-decoration: none; border-radius: 6px;">
        ${safeText}
      </a>
    </td>
  </tr>
</table>`
}

export { COLORS }
