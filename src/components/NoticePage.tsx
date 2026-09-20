import type { ReactNode } from 'react'
import { FoxSigil } from '../visual/IdentityMarks'
import styles from './NoticePage.module.css'

/** Presentation only. Callers retain their existing text, live regions and links. */
export function NoticePage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.masthead} aria-hidden="true">
        <span>Vultrove / notice</span>
        <FoxSigil />
      </div>
      <div className={styles.message}>{children}</div>
    </div>
  )
}
