import { Link } from 'react-router-dom'
import { Artifact } from '../visual/Artifact'
import { IdentityField, FoxSigil } from '../visual/IdentityMarks'
import { useIdentity } from '../visual/store'
import styles from './LandingPage.module.css'

export function LandingPage() {
  const identity = useIdentity()
  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            A small place on the internet / yours to share
          </p>
          <h1 className={styles.title}>vultrove</h1>
          <p className={styles.tagline}>one place for all your links.</p>
          <p className={styles.description}>
            Bundle mirrors, downloads, references, or anything else into one
            shareable trove. No account required.
          </p>
          <div className={styles.actions}>
            <Link to="/create" className="button">
              Create a trove <span aria-hidden="true">↗</span>
            </Link>
            <span className={styles.sideNote}>
              Gather. Share.
              <br />
              Let it go.
            </span>
          </div>
        </div>
        <div className={styles.specimen}>
          <Artifact />
        </div>
        <div className={styles.raster}>
          <IdentityField />
        </div>
        <div className={styles.annotation} aria-hidden="true">
          <FoxSigil />
          <span>
            {identity.glyphs}
            <br />
            EPHEMERAL FORM / EVERY VISIT
          </span>
        </div>
      </section>
      <section className={styles.principles} aria-label="Privacy principles">
        <div className={styles.sectionLabel}>
          Small footprint.
          <br />
          <span>By design.</span>
        </div>
        <ul className={styles.privacyList}>
          <li>
            <span className={styles.number} aria-hidden="true">
              01 /
            </span>
            <span>No account.</span>
          </li>
          <li>
            <span className={styles.number} aria-hidden="true">
              02 /
            </span>
            <span>No tracking profiles.</span>
          </li>
          <li>
            <span className={styles.number} aria-hidden="true">
              03 /
            </span>
            <span>Private troves are encrypted in your browser.</span>
          </li>
        </ul>
      </section>
      <p className={styles.easterEgg}>
        within links, interlinked.<span aria-hidden="true">↙ &nbsp; ↗</span>
      </p>
    </div>
  )
}
