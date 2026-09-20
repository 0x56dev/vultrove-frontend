import { FoxSigil } from '../visual/IdentityMarks'
import styles from './TelemetryPage.module.css'

export function TelemetryPage() {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Privacy / telemetry</p>
        <h1>
          Privacy-friendly <span>telemetry</span>
        </h1>
        <p>
          vultrove uses limited first-party aggregate telemetry to understand
          whether features are working and being used. This page explains
          exactly what that means.
        </p>
      </header>
      <section className={styles.section} aria-labelledby="counted-heading">
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">01 /</span>
          <h2 id="counted-heading">What is counted</h2>
        </div>
        <div className={styles.body}>
          <p>
            A small, fixed set of product actions increments a daily counter:
          </p>
          <ul>
            <li>a trove is created</li>
            <li>
              a public trove is opened (including the locked view shown for a
              password-protected trove, before any password is entered)
            </li>
            <li>a management view is opened</li>
            <li>a trove is updated</li>
            <li>a trove is deleted</li>
            <li>the &ldquo;Create trove&rdquo; button is submitted</li>
          </ul>
          <p>
            The first five happen automatically as part of the server handling
            that request &mdash; they are not something you do separately. The
            last one is the only event this app ever sends on your behalf, and
            only when you actually submit the create form.
          </p>
        </div>
      </section>
      <section
        className={`${styles.section} ${styles.purpose}`}
        aria-labelledby="purpose-heading"
      >
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">02 /</span>
          <h2 id="purpose-heading">Why</h2>
        </div>
        <div className={styles.body}>
          <p>
            To know, in aggregate, whether vultrove&apos;s features are working
            and being used at all &mdash; nothing more granular than that.
          </p>
        </div>
      </section>
      <section
        className={`${styles.section} ${styles.exclusions}`}
        aria-labelledby="excluded-heading"
      >
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">03 /</span>
          <h2 id="excluded-heading">What this telemetry is not</h2>
        </div>
        <div className={styles.body}>
          <p>
            Each counted event is a plain daily total, not an individual record.
          </p>
          <ul>
            <li>No individual event or visitor record is ever kept.</li>
            <li>
              No trove contents, passwords, management secrets, private
              share-URL fragments, or full share URLs are ever included.
            </li>
            <li>No trove ID or management ID is ever included.</li>
            <li>No cookies.</li>
            <li>No persistent tracking IDs.</li>
            <li>No browser fingerprinting.</li>
            <li>No third-party analytics.</li>
            <li>No cross-site tracking.</li>
          </ul>
          <p className={styles.caveat}>
            Telemetry records themselves do not store IP addresses or persistent
            visitor identifiers. This is aggregate, privacy-preserving telemetry
            &mdash; deliberately not described as &ldquo;anonymous,&rdquo; since
            that word claims more than a counting system like this can prove
            about the rest of the stack (for example, ordinary request handling
            still processes a connection&apos;s IP address the way any web
            server does, just never inside a telemetry record).
          </p>
        </div>
      </section>
      <div className={styles.endMark} aria-hidden="true">
        <FoxSigil />
      </div>
    </article>
  )
}
