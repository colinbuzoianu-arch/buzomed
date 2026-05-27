export function getPlatformIssuer() {
  return {
    name:    process.env.PLATFORM_ISSUER_NAME    ?? 'Verumsell SRL',
    cui:     process.env.PLATFORM_ISSUER_CUI     ?? null,
    regNo:   process.env.PLATFORM_ISSUER_REG_NO  ?? null,
    address: process.env.PLATFORM_ISSUER_ADDRESS ?? null,
    city:    process.env.PLATFORM_ISSUER_CITY    ?? null,
    county:  process.env.PLATFORM_ISSUER_COUNTY  ?? null,
    email:   process.env.PLATFORM_ISSUER_EMAIL   ?? null,
    phone:   process.env.PLATFORM_ISSUER_PHONE   ?? null,
    bank:    process.env.PLATFORM_ISSUER_BANK    ?? null,
    iban:    process.env.PLATFORM_ISSUER_IBAN    ?? null,
  }
}
