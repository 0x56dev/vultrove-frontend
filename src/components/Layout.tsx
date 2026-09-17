import { Link, Outlet } from 'react-router-dom'
import { Logo } from './Logo'
import styles from './Layout.module.css'

export function Layout() {
  return (
    <div>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className="site-header">
          <Link to="/" aria-label="vultrove home">
            <Logo />
          </Link>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
