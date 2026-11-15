import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { activeGroupId, isActive, NAV, type NavGroup, type NavLeaf, type NavLink } from './nav'

const row = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[14px] whitespace-nowrap'

function LeafLink({ item, pathname, nested }: { item: NavLeaf; pathname: string; nested?: boolean }) {
  const active = !item.external && isActive(item, pathname)
  const tone = nested
    ? active ? 'bg-cream font-medium text-ink' : 'text-muted hover:bg-cream hover:text-ink'
    : active ? 'bg-ink text-white' : 'text-muted hover:bg-cream'
  const className = `${row} ${tone} ${nested ? 'py-2 pl-10 text-[13px]' : ''}`
  if (item.external) {
    return (
      <a href={item.to} target="_blank" rel="noopener noreferrer" className={className}>
        <span className="flex-1">{item.label}</span>
        <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      </a>
    )
  }
  return (
    <Link to={item.to} aria-current={active ? 'page' : undefined} className={className}>
      {!nested && <Icon item={item as NavLink} />}
      {item.label}
    </Link>
  )
}

function Icon({ item }: { item: NavLink | NavGroup }) {
  const I = item.icon
  return <I className="size-5 shrink-0" />
}

function Group({ group, pathname, open, onToggle }: { group: NavGroup; pathname: string; open: boolean; onToggle: () => void }) {
  const hasActive = activeGroupId(pathname) === group.id
  const listId = `admin-nav-${group.id}`
  return (
    <div>
      <button
        type="button" onClick={onToggle} aria-expanded={open} aria-controls={listId}
        className={`${row} ${hasActive ? 'font-medium text-ink' : 'text-muted'} hover:bg-cream`}
      >
        <Icon item={group} />
        <span className="flex-1">{group.label}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="mt-0.5 mb-1 space-y-0.5">
          {group.items.map((item) => (
            <li key={item.to}><LeafLink item={item} pathname={pathname} nested /></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The grouped admin menu. A group opens by itself when the URL moves into it, and can be toggled by hand. */
export default function AdminNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([activeGroupId(pathname)].filter((g): g is string => !!g)))

  useEffect(() => {
    const id = activeGroupId(pathname)
    if (id) setOpen((prev) => (prev.has(id) ? prev : new Set([...prev, id])))
  }, [pathname])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-1 px-3">
      {NAV.map((entry) => {
        if (entry.kind === 'heading') {
          return <p key={entry.label} className="mt-4 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{entry.label}</p>
        }
        if (entry.kind === 'link') return <LeafLink key={entry.to} item={entry} pathname={pathname} />
        return <Group key={entry.id} group={entry} pathname={pathname} open={open.has(entry.id)} onToggle={() => toggle(entry.id)} />
      })}
    </nav>
  )
}
