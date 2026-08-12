'use client'

export default function QrPrintLabel({
  code,
  type,
  title,
  subtitle,
  buttonClassName,
}: {
  code: string
  type: 'apparatus' | 'compartment' | 'bottle' | 'hose-testing'
  title: string
  subtitle?: string
  buttonClassName?: string
}) {
  function handlePrint() {
    const params = new URLSearchParams({ type, code, title })
    if (subtitle) params.set('subtitle', subtitle)
    window.open(`/print/qr?${params.toString()}`, '_blank')
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={buttonClassName ?? 'text-xs font-medium text-red-700 hover:underline print:hidden'}
    >
      Print QR Label
    </button>
  )
}
