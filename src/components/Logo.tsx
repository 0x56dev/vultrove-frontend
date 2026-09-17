import styles from './Logo.module.css'

/**
 * Vultrove wordmark. The mark is a restrained geometric shape — two peaks
 * over a downward point — intentionally subtle rather than a literal fox
 * illustration.
 */
export function Logo() {
  return (
    <span className={styles.wordmark}>
      <svg
        className={styles.mark}
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M2 4L8 9.5L10 7L12 9.5L18 4L15 15L10 18L5 15L2 4Z"
          fill="currentColor"
        />
      </svg>
      vultrove
    </span>
  )
}
