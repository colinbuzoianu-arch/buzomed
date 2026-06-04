import { GoogleAnalytics } from '@next/third-parties/google'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {process.env.NODE_ENV === 'production' && (
        <GoogleAnalytics gaId="G-J0306LBB42" />
      )}
    </>
  )
}
