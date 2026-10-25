import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/companies',
          '/employees',
          '/examinations',
          '/intermediaries',
          '/medical-events',
          '/recalls',
          '/reports',
          '/settings',
          '/super-admin',
          '/team',
          '/hr-portal',
          '/accept-invite',
          '/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
