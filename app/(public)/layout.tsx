import { GaLoader } from '@/components/ga-loader'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GaLoader />
    </>
  )
}
