import { act, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useIdentity, rerollIdentity } from './store'

function Sample() {
  const identity = useIdentity()
  return <output data-testid="art">{identity.dots}</output>
}
it('retains art across rerenders/remounts and only changes on explicit reroll', () => {
  const view = render(<Sample />)
  const original = screen.getByTestId('art').textContent
  view.rerender(<Sample />)
  expect(screen.getByTestId('art').textContent).toBe(original)
  view.unmount()
  render(<Sample />)
  expect(screen.getByTestId('art').textContent).toBe(original)
  act(rerollIdentity)
  expect(screen.getByTestId('art').textContent).not.toBe(original)
})
