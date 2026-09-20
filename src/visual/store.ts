import { useSyncExternalStore } from 'react'
import { makeIdentity, randomSeed, type Identity } from './identity'

let identity: Identity | undefined
const listeners = new Set<() => void>()
function snapshot() {
  // Lazily initialized once per loaded document, including across route remounts.
  identity ??= makeIdentity(randomSeed())
  return identity
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function rerollIdentity() {
  identity = makeIdentity(randomSeed())
  listeners.forEach((listener) => listener())
}
export function useIdentity() {
  return useSyncExternalStore(subscribe, snapshot)
}
