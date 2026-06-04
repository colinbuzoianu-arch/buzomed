import Image from 'next/image'
import Link from 'next/link'
import { Mail, Monitor, Shield } from 'lucide-react'
import { ContactForm } from '@/components/landing/ContactForm'

function Nav() {
  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Image src="/buzomed-icon.png" width={28} height={28} alt="Buzomed" />
          <span style={{ fontWeight: 600, fontSize: 18, color: '#0F1F3A', letterSpacing: '-0.01em' }}>
            buzomed
          </span>
        </Link>
      </div>
    </nav>
  )
}

function ContactCard({
  iconBg,
  icon,
  title,
  value,
  valueMono,
  valueHref,
  sub,
  link,
  linkHref,
}: {
  iconBg: string
  icon: React.ReactNode
  title: string
  value?: string
  valueMono?: boolean
  valueHref?: string
  sub?: string
  link?: string
  linkHref?: string
}) {
  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1F3A', margin: 0 }}>{title}</p>
        {value && valueHref && (
          <a
            href={valueHref}
            style={{
              display: 'block',
              marginTop: 4,
              fontSize: 14,
              color: '#2BA39A',
              fontFamily: valueMono ? 'monospace' : 'inherit',
              textDecoration: 'none',
            }}
          >
            {value}
          </a>
        )}
        {value && !valueHref && (
          <p style={{ fontSize: 14, color: '#6B7A8D', marginTop: 4, marginBottom: 0 }}>{value}</p>
        )}
        {sub && (
          <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4, marginBottom: 0 }}>{sub}</p>
        )}
        {link && linkHref && (
          <a href={linkHref} className="contact-link">
            {link}
          </a>
        )}
      </div>
    </div>
  )
}

export default function ContactPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: 'Inter, sans-serif' }}>
      <style>{`.contact-link { display: block; margin-top: 4px; font-size: 14px; color: #2BA39A; text-decoration: none; } .contact-link:hover { text-decoration: underline; }`}</style>
      <Nav />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 64,
          alignItems: 'start',
        }}>
          {/* Left column */}
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F1F3A', margin: 0 }}>
              Contact
            </h1>
            <p style={{ fontSize: 17, color: '#6B7A8D', marginTop: 12, lineHeight: 1.7, maxWidth: 400 }}>
              Suntem aici să răspundem la întrebările dumneavoastră despre Buzomed.
            </p>

            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ContactCard
                iconBg="#EBF3FB"
                icon={<Mail size={20} color="#1E4D8B" />}
                title="Email"
                value="hello@buzomed.com"
                valueMono
                valueHref="mailto:hello@buzomed.com"
                sub="Răspundem în 24-48 ore lucrătoare"
              />
              <ContactCard
                iconBg="#E6F5F4"
                icon={<Monitor size={20} color="#2BA39A" />}
                title="Demonstrație live"
                value="Programați o sesiune de 20 min"
                link="Trimiteți un email →"
                linkHref="mailto:hello@buzomed.com?subject=Demo%20Buzomed"
              />
              <ContactCard
                iconBg="#EBF3FB"
                icon={<Shield size={20} color="#1E4D8B" />}
                title="Date și confidențialitate"
                value="Date găzduite în Frankfurt, UE"
                link="Politică de confidențialitate →"
                linkHref="/privacy"
              />
            </div>

            <div style={{ marginTop: 40 }}>
              <p style={{ fontSize: 11, color: '#2BA39A', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                VERUMSELL SRL
              </p>
              <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4, lineHeight: 1.6 }}>
                Operator platformă Buzomed<br />
                hello@buzomed.com
              </p>
            </div>
          </div>

          {/* Right column — contact form */}
          <div style={{
            background: 'white',
            border: '1px solid #E2E8F0',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  )
}
