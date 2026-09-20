import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TroveForm } from './TroveForm'
import { createInitialValues } from './initial-values'

describe('create instrument summary', () => {
  it('updates from the existing fields without exposing URL or password values or changing the art', () => {
    const onSubmit = vi.fn()
    render(
      <TroveForm
        formMode="create"
        initialValues={createInitialValues('link-0')}
        onSubmit={onSubmit}
        submitLabel="Create trove"
      />,
    )
    const summary = screen.getByRole('complementary', {
      name: 'Your trove / draft',
    })
    const artwork = [...summary.querySelectorAll('svg path')].map((path) =>
      path.getAttribute('d'),
    )
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Reading list' } })
    fireEvent.change(screen.getByLabelText('Link 1 URL'), {
      target: { value: 'https://example.com/private-destination' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /private/i }))
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'do-not-display-this' },
    })
    fireEvent.change(screen.getByLabelText('Expiration'), {
      target: { value: '1d' },
    })
    expect(screen.getByLabelText('Title')).toBe(title)
    expect(within(summary).getByText('Reading list')).toBeInTheDocument()
    expect(within(summary).getByText('Private')).toBeInTheDocument()
    expect(within(summary).getByText('Required')).toBeInTheDocument()
    expect(within(summary).getByText('1 day')).toBeInTheDocument()
    expect(summary).not.toHaveTextContent('do-not-display-this')
    expect(summary).not.toHaveTextContent('private-destination')
    expect(
      [...summary.querySelectorAll('svg path')].map((path) =>
        path.getAttribute('d'),
      ),
    ).toEqual(artwork)
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }))
    expect(within(summary).getByText('02')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove link 2' }))
    expect(within(summary).getByText('01')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      title: 'Reading list',
      mode: 'private',
      password: 'do-not-display-this',
      expiration: '1d',
      links: [{ url: 'https://example.com/private-destination' }],
    })
  })
  it('does not add a draft summary or mode picker to editing', () => {
    render(
      <TroveForm
        formMode="edit"
        initialValues={createInitialValues('link-0')}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Expiration')).toBeInTheDocument()
  })
})
