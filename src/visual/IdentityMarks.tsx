import { useIdentity } from './store'

export function FoxSigil() {
  const identity = useIdentity()
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 10 10"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d={identity.sigil} fill="currentColor" />
    </svg>
  )
}
export function IdentityField() {
  const identity = useIdentity()
  return (
    <svg
      viewBox="0 0 384 256"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d={identity.dots} fill="currentColor" />
      <path
        d={identity.lines}
        fill="none"
        stroke="currentColor"
        strokeWidth=".5"
        opacity=".3"
      />
    </svg>
  )
}
