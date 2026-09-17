import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>There&apos;s nothing at this address.</p>
      <p>
        <Link to="/">Back to vultrove</Link>
      </p>
    </div>
  )
}
