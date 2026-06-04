'use client'

import dynamic from 'next/dynamic'
import 'swagger-ui-react/swagger-ui.css'

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false })

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <div className="font-bold text-xl text-gray-900">Buzomed</div>
        <span className="text-gray-300">|</span>
        <div className="text-gray-600 text-sm">Public API Documentation</div>
      </header>
      <div className="max-w-6xl mx-auto">
        <SwaggerUI url="/api/v1/openapi.json" />
      </div>
    </div>
  )
}
