import { Link } from 'react-router-dom'
import { PageHeader } from './ui'

/** Placeholder for menu items whose screen is not built yet, so every link in the sidebar lands on a real page. */
export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="rounded-lg bg-white px-6 py-14 text-center">
        <p className="font-serif text-[22px]">Coming soon</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">{note ?? 'This section is being built and will appear here.'}</p>
      </div>
    </div>
  )
}

export function AdminNotFound() {
  return (
    <div>
      <PageHeader title="Page not found" />
      <div className="rounded-lg bg-white px-6 py-14 text-center text-[13px] text-muted">
        This admin page does not exist. <Link to="/admin" className="underline">Back to the dashboard</Link>
      </div>
    </div>
  )
}
