import { useEffect, useRef, useState } from 'react'
import { useIdentity, rerollIdentity } from './store'
import styles from './Artifact.module.css'

export function Artifact() {
  const identity = useIdentity()
  const svg = useRef<SVGSVGElement>(null)
  const path = useRef<SVGPathElement>(null)
  const orientation = useRef({ x: -0.18, y: 0.55 })
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const surface = svg.current!
    const drawing = path.current!
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let reduced = motion?.matches ?? false
    let x = orientation.current.x,
      y = orientation.current.y,
      vx = 0,
      vy = 0
    let drag: { id: number; x: number; y: number; time: number } | null = null
    let frame = 0,
      previous = 0
    const render = () => {
      const projected = identity.points.map(([px, py, pz]) => {
        const a = px * Math.cos(y) + pz * Math.sin(y)
        const b = -px * Math.sin(y) + pz * Math.cos(y)
        const c = py * Math.cos(x) - b * Math.sin(x)
        const depth = py * Math.sin(x) + b * Math.cos(x)
        const scale = 106 / (1 + depth * 0.14)
        return [200 + a * scale, 178 + c * scale]
      })
      drawing.setAttribute(
        'd',
        identity.edges
          .map(
            ([a, b]) =>
              `M${projected[a]!.join(' ')}L${projected[b]!.join(' ')}`,
          )
          .join(''),
      )
    }
    const tick = (now: number) => {
      frame = 0
      if (reduced || paused || document.hidden) return
      const dt = previous ? Math.min((now - previous) / 1000, 0.04) : 0
      previous = now
      if (!drag && !reduced && !paused) {
        x += vx * dt
        y += (vy + 0.1) * dt
        vx *= Math.exp(-2.2 * dt)
        vy *= Math.exp(-2.2 * dt)
        render()
      }
      frame = requestAnimationFrame(tick)
    }
    const down = (event: PointerEvent) => {
      if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return
      surface.setPointerCapture(event.pointerId)
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      }
      vx = vy = 0
    }
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return
      const dt = Math.max((event.timeStamp - drag.time) / 1000, 0.008)
      const scale = 3.5 / surface.getBoundingClientRect().width
      const dx = (event.clientY - drag.y) * scale
      const dy = (event.clientX - drag.x) * scale
      x += dx
      y += dy
      vx = Math.max(-8, Math.min(8, dx / dt))
      vy = Math.max(-8, Math.min(8, dy / dt))
      drag = {
        id: drag.id,
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      }
      render()
    }
    const up = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return
      if (
        event.type !== 'pointerup' ||
        event.timeStamp - drag.time > 100 ||
        reduced ||
        paused
      )
        vx = vy = 0
      drag = null
      if (surface.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId)
    }
    const key = (event: KeyboardEvent) => {
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      vx = vy = 0
      if (event.key === 'Home') {
        x = -0.18
        y = 0.55
      } else {
        x +=
          event.key === 'ArrowUp' ? -0.15 : event.key === 'ArrowDown' ? 0.15 : 0
        y +=
          event.key === 'ArrowLeft'
            ? -0.15
            : event.key === 'ArrowRight'
              ? 0.15
              : 0
      }
      render()
    }
    const preference = () => {
      reduced = motion?.matches ?? false
      vx = vy = 0
      cancelAnimationFrame(frame)
      frame = 0
      previous = 0
      if (!reduced && !paused && !document.hidden)
        frame = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', preference)
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', up)
    surface.addEventListener('lostpointercapture', up)
    surface.addEventListener('keydown', key)
    motion?.addEventListener('change', preference)
    render()
    preference()
    return () => {
      orientation.current = { x, y }
      document.removeEventListener('visibilitychange', preference)
      cancelAnimationFrame(frame)
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerup', up)
      surface.removeEventListener('pointercancel', up)
      surface.removeEventListener('lostpointercapture', up)
      surface.removeEventListener('keydown', key)
      motion?.removeEventListener('change', preference)
    }
  }, [identity, paused])
  return (
    <section
      className={styles.artifact}
      aria-label="Interactive cosmetic artwork"
    >
      <div className={styles.chrome}>
        <span>FORM / VULPINE</span>
        <span aria-hidden="true">+ &nbsp; +</span>
      </div>
      <svg
        ref={svg}
        className={styles.surface}
        viewBox="0 0 400 350"
        tabIndex={0}
        role="img"
        aria-label="Fox-inspired wireframe. Drag to rotate; arrow keys rotate and Home resets."
      >
        <path
          d="M16 30V16H30M370 16H384V30M16 320V334H30M370 334H384V320"
          className={styles.marks}
        />
        <ellipse cx="200" cy="285" rx="120" ry="24" className={styles.marks} />
        <path ref={path} fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <div className={styles.controls}>
        <span>Drag / flick / arrow keys</span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
        >
          {paused ? 'Resume motion' : 'Pause motion'}
        </button>
      </div>
      <div className={styles.caption}>
        <span>
          A passing form.
          <br />
          Nothing of you inside it.
        </span>
        <button type="button" onClick={rerollIdentity}>
          Reroll artwork <span aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  )
}
