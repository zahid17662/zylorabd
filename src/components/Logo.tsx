export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`font-sans text-[22px] leading-none font-normal tracking-[0.42em] uppercase ${className}`} style={{ marginRight: '-0.42em' }}>
      Zylora
    </span>
  )
}
