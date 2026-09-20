import { NoticePage } from '../components/NoticePage'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <NoticePage>
      <h1>Page not found</h1>
      <p>There&apos;s nothing at this address.</p>
      <p>
        <Link to="/">Back to vultrove</Link>
      </p>
    </NoticePage>
  )
}
