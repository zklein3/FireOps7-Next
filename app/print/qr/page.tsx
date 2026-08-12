'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'

const BASE_URL = 'https://municipal-hub.com'

function PrintContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code') ?? ''
  const type = searchParams.get('type') ?? ''
  const title = searchParams.get('title') ?? code
  const subtitle = searchParams.get('subtitle') ?? ''

  const qrValue = type === 'bottle'
    ? `${BASE_URL}/fire-school?scan=${encodeURIComponent(code)}`
    : type === 'checkin'
    ? `${BASE_URL}/checkin/${code}`
    : type === 'hose-testing'
    ? `${BASE_URL}/hose-testing/${code}`
    : `${BASE_URL}/scan?type=${type}&code=${encodeURIComponent(code)}`

  const displayCode = type === 'checkin' ? null : code

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      fontFamily: 'sans-serif',
      background: '#fff',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '2rem',
        border: '2px dashed #a1a1aa',
        borderRadius: '12px',
      }}>
        <QRCodeSVG value={qrValue} size={220} level="M" />
        {displayCode && (
          <p style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.1em', color: '#18181b', margin: 0 }}>
            {displayCode}
          </p>
        )}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#27272a', margin: 0 }}>{title}</p>
          {subtitle && (
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginTop: '0.25rem', margin: '0.25rem 0 0' }}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PrintQrPage() {
  return <Suspense><PrintContent /></Suspense>
}
