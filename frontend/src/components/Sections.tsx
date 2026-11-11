import { useRef } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { collections, creations, img, services, type Product } from '../data'
import { ProductCard } from './ProductCard'

export function SectionTitle({ title, sub, link, compact }: { title: string; sub?: string; link?: { label: string; href: string }; compact?: boolean }) {
  return (
    <div className="mb-5 text-center md:mb-8">
      {sub && <p className="caps mb-3 !text-[11px] text-muted">{sub}</p>}
      <h2 className={`font-serif leading-tight font-normal md:text-[44px] ${compact ? 'px-6 text-[24px]' : 'text-[32px]'}`}>{title}</h2>
      {link && (
        <a href={link.href} className="link-line mt-4 inline-block text-[14px]">
          {link.label}
        </a>
      )}
    </div>
  )
}

/* LV-style horizontal selection of creations */
export function Creations() {
  const track = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section id="creations" className="scroll-mt-20 py-8 md:py-14">
      <SectionTitle compact title="Explore a Selection of Zylora’s Creations" />

      {/* Phone: round category thumbnails, wrapped and centred */}
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-5 px-3 md:hidden">
        {creations.map((c) => (
          <li key={c.name} className="w-[calc(25%-0.6rem)]">
            <a href="#new-arrivals" className="group block text-center">
              <span className="block aspect-square overflow-hidden rounded-full border border-line bg-cream">
                <img src={img(c.image, 240, 240)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-500 group-active:scale-105" />
              </span>
              <span className="mt-2 block text-[11.5px] leading-tight">{c.name}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="relative hidden md:block">
        <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-4 md:gap-3 md:px-10">
          {creations.map((c) => (
            <a key={c.name} href="#new-arrivals" className="group w-[62%] shrink-0 snap-start sm:w-[38%] md:w-[24%] lg:w-[19%]">
              <div className="aspect-[4/5] overflow-hidden bg-cream">
                <img src={img(c.image, 600, 750)} alt={c.name} loading="lazy" decoding="async" className="size-full object-cover transition duration-[1200ms] group-hover:scale-105" />
              </div>
              <p className="mt-4 text-center text-[14px]">{c.name}</p>
            </a>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => scroll(-1)} aria-label="Previous" className="grid size-10 place-items-center rounded-full border border-line hover:border-ink">
            <ArrowLeft className="size-4" strokeWidth={1.25} />
          </button>
          <button onClick={() => scroll(1)} aria-label="Next" className="grid size-10 place-items-center rounded-full border border-line hover:border-ink">
            <ArrowRight className="size-4" strokeWidth={1.25} />
          </button>
        </div>
      </div>
    </section>
  )
}

export function ProductSection({ id, title, sub, products }: { id: string; title: string; sub: string; products: Product[] }) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-8 md:px-10 md:py-14">
      <SectionTitle title={title} sub={sub} link={{ label: 'View all', href: `#${id}` }} />
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ul>
    </section>
  )
}

/* Two side-by-side full-bleed editorial panels */
export function EditorialSplit() {
  const panels = [
    { image: '1770825491966-7b9c3124edad', kicker: 'Festive', title: 'Kurti & Three Piece', href: '#eid-collection' },
    { image: '1732613838153-00dbc88adbb4', kicker: 'Accessories', title: 'Handbags & Jewellery', href: '#collections' },
  ]
  return (
    <section className="grid md:grid-cols-2">
      {panels.map((p) => (
        <a key={p.title} href={p.href} className="group relative block aspect-[4/5] overflow-hidden md:aspect-auto md:h-[92svh] md:max-h-[900px]">
          <img src={img(p.image, 1200)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition duration-[1600ms] group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-12 text-center text-white">
            <p className="caps !text-[11px] text-white/85">{p.kicker}</p>
            <h3 className="mt-2 font-serif text-[34px] leading-tight md:text-[44px]">{p.title}</h3>
            <span className="link-line mt-3 inline-block text-[14px]">Discover</span>
          </div>
        </a>
      ))}
    </section>
  )
}

export function Collections() {
  return (
    <section id="collections" className="scroll-mt-20 bg-cream px-4 py-8 md:px-10 md:py-14">
      <SectionTitle title="Shop by Collection" sub="Curated for you" />
      <div className="mx-auto grid max-w-[1400px] gap-3 md:grid-cols-3">
        {collections.map((c) => (
          <a key={c.name} href="#new-arrivals" className="group relative block aspect-[439/535] overflow-hidden bg-sand">
            <img src={img(c.image, 900)} alt={c.name} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition duration-[1400ms] group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-10 text-center text-white">
              <p className="caps !text-[11px] text-white/85">{c.sub}</p>
              <h3 className="mt-2 font-serif text-[40px] leading-none">{c.name}</h3>
              <span className="link-line mt-4 inline-block text-[14px]">Shop Now</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

/* Brand story — speaks to women across life stages */
export function Story() {
  return (
    <section className="grid items-center md:grid-cols-2">
      <div className="aspect-[4/5] overflow-hidden md:aspect-auto md:h-[86svh] md:max-h-[860px]">
        <img src={img('1603400521630-9f2de124b33b', 1200)} alt="Rails of Zylora garments in soft neutral tones" loading="lazy" decoding="async" className="size-full object-cover" />
      </div>
      <div className="px-6 py-10 text-center md:px-16 lg:px-24">
        <p className="caps !text-[11px] text-muted">The Zylora Woman</p>
        <h2 className="mt-4 font-serif text-[36px] leading-[1.1] md:text-[52px]">
          Made for every
          <br />
          <em>chapter of her life</em>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-muted">
          From her first job to her daughter’s wedding, she dresses for herself. Zylora designs kurtis, three piece sets
          and western wear in generous, flattering cuts and breathable fabrics — for women of 25, 45 and beyond.
        </p>
        <div className="mx-auto mt-10 grid max-w-md grid-cols-3 border-y border-line py-6">
          {[
            ['S – XXL', 'Inclusive sizes'],
            ['100%', 'Breathable fabrics'],
            ['7 days', 'Easy exchange'],
          ].map(([v, l]) => (
            <div key={l}>
              <p className="font-serif text-[26px] leading-none">{v}</p>
              <p className="mt-2 text-[12px] text-muted">{l}</p>
            </div>
          ))}
        </div>
        <a href="#new-arrivals" className="mt-10 inline-block rounded-full border border-ink px-8 py-3.5 text-[14px] transition-colors hover:bg-ink hover:text-white">
          Discover Our Story
        </a>
      </div>
    </section>
  )
}

export function Services() {
  return (
    <section id="services" className="scroll-mt-20 px-4 py-8 md:px-10 md:py-14">
      <SectionTitle title="Zylora Services" />
      <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-3 md:gap-3">
        {services.map((s) => (
          <div key={s.title} className="text-center">
            <div className="aspect-[4/3] overflow-hidden bg-cream">
              <img src={img(s.image, 900, 675)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            </div>
            <h3 className="mt-6 font-serif text-[26px] leading-tight">{s.title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">{s.text}</p>
            <a href="#services" className="link-line mt-4 inline-block text-[14px]">
              {s.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
