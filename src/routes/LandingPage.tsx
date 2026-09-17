import { Link } from 'react-router-dom'
import styles from './LandingPage.module.css'

export function LandingPage() {
  return (
    <div className="page">
      <section className={styles.hero}>
        <h1 className={styles.title}>vultrove</h1>
        <p className={styles.tagline}>one place for all your links.</p>
        <p>
          Bundle mirrors, downloads, references, or anything else into one
          shareable trove. No account required.
        </p>
        <div className={styles.actions}>
          <Link to="/create" className="button">
            Create a trove
          </Link>
        </div>
        <ul className={styles.privacyList}>
          <li>
            <span className={styles.bullet} aria-hidden="true">
              &bull;
            </span>
            No account.
          </li>
          <li>
            <span className={styles.bullet} aria-hidden="true">
              &bull;
            </span>
            No tracking profiles.
          </li>
          <li>
            <span className={styles.bullet} aria-hidden="true">
              &bull;
            </span>
            Private troves are encrypted in your browser.
          </li>
        </ul>
      </section>
      <p className={styles.easterEgg}>within links, interlinked.</p>
    </div>
  )
}
