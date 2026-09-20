import { Link, Outlet } from 'react-router-dom'
import { FoxSigil } from '../visual/IdentityMarks'
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
          <span className={styles.headerNote}>
            LINKS, INTERLINKED <FoxSigil />
          </span>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>
          Privacy-friendly telemetry: vultrove uses limited first-party
          aggregate telemetry to understand whether features are working and
          being used. <Link to="/privacy-telemetry">Learn more</Link>
        </p>
      </footer>
    </div>
  )
}
