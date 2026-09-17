import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TroveForm } from './TroveForm'
import { createInitialValues } from './initial-values'
import { MAX_LINKS } from './validation'
import type { TroveFormValues } from './types'

function fillValidLink(url: string) {
  const input = screen.getByLabelText('Link 1 URL')
  fireEvent.change(input, { target: { value: url } })
  return input
}

function renderCreateForm(
  overrides: Partial<Parameters<typeof TroveForm>[0]> = {},
) {
  const onSubmit = vi.fn()
  render(
    <TroveForm
      formMode="create"
      initialValues={createInitialValues('link-0')}
      onSubmit={onSubmit}
      submitLabel="Create trove"
      {...overrides}
    />,
  )
  return onSubmit
}

describe('initial form state (create)', () => {
  it('starts with Standard selected, one empty link row, and no errors visible', () => {
    renderCreateForm()

    expect(screen.getByRole('radio', { name: /standard/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /private/i })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /private/i })).not.toBeDisabled()
    expect(screen.getByLabelText('Link 1 URL')).toHaveValue('')
    expect(screen.queryByText(/enter a title/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/enter a url/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove link 1' })).toBeDisabled()
  })

  it('defaults expiration to 7 days', () => {
    renderCreateForm()
    expect(screen.getByLabelText('Expiration')).toHaveValue('7d')
  })

  it('starts with password protection off and the password field hidden', () => {
    renderCreateForm()
    const checkbox = screen.getByLabelText(
      'Require a password to view this trove',
    )
    expect(checkbox).not.toBeDisabled()
    expect(checkbox).not.toBeChecked()
    expect(
      screen.getByText(/this password is checked by the server/i),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })
})

describe('password protection (create)', () => {
  it('reveals the password field once the checkbox is checked', () => {
    renderCreateForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    )
  })

  it('caps the password input at 256 characters via maxLength', () => {
    renderCreateForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'maxLength',
      '256',
    )
  })

  it('does not show the "leave blank to keep current" hint in create mode', () => {
    renderCreateForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    expect(screen.queryByText(/leave blank to keep/i)).not.toBeInTheDocument()
  })

  it('requires a password once protection is enabled, blocking submission until one is entered', () => {
    const onSubmit = renderCreateForm()
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'My mirrors' },
    })
    fillValidLink('https://example.com/a')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))
    expect(
      screen.getByText(/enter a password, or turn off password protection/i),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ passwordEnabled: true, password: 'hunter2' }),
    )
  })

  it('submits with passwordEnabled: false and an empty password when left off', () => {
    const onSubmit = renderCreateForm()
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'My mirrors' },
    })
    fillValidLink('https://example.com/a')
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ passwordEnabled: false, password: '' }),
    )
  })
})

describe('edit mode', () => {
  function editValues(): TroveFormValues {
    return {
      mode: 'standard',
      title: 'Existing title',
      description: 'Existing description',
      links: [{ id: 'link-0', url: 'https://example.com/a', label: 'A' }],
      expiration: '',
      passwordEnabled: false,
      password: '',
    }
  }

  it('omits the Trove type mode picker entirely', () => {
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    expect(
      screen.queryByRole('radio', { name: /standard/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: /private/i }),
    ).not.toBeInTheDocument()
  })

  it('prefills fields from initialValues', () => {
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Existing title')
    expect(screen.getByLabelText('Description (optional)')).toHaveValue(
      'Existing description',
    )
    expect(screen.getByLabelText('Link 1 URL')).toHaveValue(
      'https://example.com/a',
    )
  })

  it('defaults the expiration select to "keep current", showing the current expiry', () => {
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        currentExpiresAt={new Date('2026-06-01T12:00:00.000Z')}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    const select = screen.getByLabelText('Expiration') as HTMLSelectElement
    expect(select).toHaveValue('')
    expect(within(select).getByText(/keep current/i)).toBeInTheDocument()
  })

  it('shows "never" for a keep-current option when currentExpiresAt is null', () => {
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        currentExpiresAt={null}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    expect(
      screen.getByText(/keep current \(expires never\)/i),
    ).toBeInTheDocument()
  })

  it('submits with a real expiration code once explicitly changed away from "keep current"', () => {
    const onSubmit = vi.fn()
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />,
    )
    fireEvent.change(screen.getByLabelText('Expiration'), {
      target: { value: '30d' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ expiration: '30d' }),
    )
  })

  it('submits with the "" sentinel when expiration is left at "keep current"', () => {
    const onSubmit = vi.fn()
    render(
      <TroveForm
        formMode="edit"
        initialValues={editValues()}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ expiration: '' }),
    )
  })

  describe('password protection', () => {
    function protectedEditValues(): TroveFormValues {
      return { ...editValues(), passwordEnabled: true, password: '' }
    }

    it('prefills the checkbox as checked, with the password field blank, for an already-protected trove', () => {
      render(
        <TroveForm
          formMode="edit"
          initialValues={protectedEditValues()}
          onSubmit={vi.fn()}
          submitLabel="Save changes"
        />,
      )
      expect(
        screen.getByLabelText('Require a password to view this trove'),
      ).toBeChecked()
      expect(screen.getByLabelText('Password')).toHaveValue('')
    })

    it('shows the "leave blank to keep current password" hint for an already-protected trove', () => {
      render(
        <TroveForm
          formMode="edit"
          initialValues={protectedEditValues()}
          onSubmit={vi.fn()}
          submitLabel="Save changes"
        />,
      )
      expect(
        screen.getByText(/leave blank to keep the current password/i),
      ).toBeInTheDocument()
    })

    it('allows submitting with a blank password when already protected — no validation error', () => {
      const onSubmit = vi.fn()
      render(
        <TroveForm
          formMode="edit"
          initialValues={protectedEditValues()}
          onSubmit={onSubmit}
          submitLabel="Save changes"
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(
        screen.queryByText(/enter a password, or turn off password/i),
      ).not.toBeInTheDocument()
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ passwordEnabled: true, password: '' }),
      )
    })

    it('submits a replacement password when one is typed over an already-protected trove', () => {
      const onSubmit = vi.fn()
      render(
        <TroveForm
          formMode="edit"
          initialValues={protectedEditValues()}
          onSubmit={onSubmit}
          submitLabel="Save changes"
        />,
      )
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'new-password' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordEnabled: true,
          password: 'new-password',
        }),
      )
    })

    it('submits passwordEnabled: false when protection is unchecked on an already-protected trove', () => {
      const onSubmit = vi.fn()
      render(
        <TroveForm
          formMode="edit"
          initialValues={protectedEditValues()}
          onSubmit={onSubmit}
          submitLabel="Save changes"
        />,
      )
      fireEvent.click(
        screen.getByLabelText('Require a password to view this trove'),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ passwordEnabled: false }),
      )
    })

    it('does not show the "leave blank to keep" hint, and requires a value, when newly enabling protection on an unprotected trove', () => {
      const onSubmit = vi.fn()
      render(
        <TroveForm
          formMode="edit"
          initialValues={editValues()}
          onSubmit={onSubmit}
          submitLabel="Save changes"
        />,
      )
      fireEvent.click(
        screen.getByLabelText('Require a password to view this trove'),
      )
      expect(screen.queryByText(/leave blank to keep/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(
        screen.getByText(/enter a password, or turn off password protection/i),
      ).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})

describe('expiration (create)', () => {
  it('offers exactly the six documented codes, in order, with no keep-current option', () => {
    renderCreateForm()
    const select = screen.getByLabelText('Expiration')
    const optionValues = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
    expect(optionValues).toEqual(['1h', '1d', '7d', '30d', '1y', 'never'])
  })

  it('shows human-readable labels for each code', () => {
    renderCreateForm()
    const select = screen.getByLabelText('Expiration')
    const optionLabels = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(optionLabels).toEqual([
      '1 hour',
      '1 day',
      '7 days',
      '30 days',
      '1 year',
      'Never',
    ])
  })

  it.each(['1h', '1d', '7d', '30d', '1y', 'never'])(
    'can select expiration code %s',
    (code) => {
      renderCreateForm()
      const select = screen.getByLabelText('Expiration')
      fireEvent.change(select, { target: { value: code } })
      expect(select).toHaveValue(code)
    },
  )
})

describe('link rows', () => {
  it('adds a new link row on demand', () => {
    renderCreateForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }))
    expect(screen.getByLabelText('Link 2 URL')).toBeInTheDocument()
  })

  it('removes a link row, keeping remaining rows renumbered', () => {
    renderCreateForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }))
    expect(screen.queryByLabelText('Link 2 URL')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Link 1 URL')).toBeInTheDocument()
  })

  it('cannot go below the documented minimum of one link', () => {
    renderCreateForm()
    const removeButton = screen.getByRole('button', { name: 'Remove link 1' })
    expect(removeButton).toBeDisabled()
    fireEvent.click(removeButton)
    expect(screen.getByLabelText('Link 1 URL')).toBeInTheDocument()
  })

  it('cannot exceed the documented maximum of 25 links', () => {
    renderCreateForm()
    const addButton = screen.getByRole('button', { name: 'Add another link' })
    for (let i = 1; i < MAX_LINKS; i += 1) {
      fireEvent.click(addButton)
    }
    expect(screen.getByLabelText(`Link ${MAX_LINKS} URL`)).toBeInTheDocument()
    expect(addButton).toBeDisabled()
    expect(screen.getByText(/reached the maximum of 25/i)).toBeInTheDocument()

    fireEvent.click(addButton)
    expect(
      screen.queryByLabelText(`Link ${MAX_LINKS + 1} URL`),
    ).not.toBeInTheDocument()
  })
})

describe('URL validation', () => {
  it('does not show an error while the user is still typing', () => {
    renderCreateForm()
    const input = screen.getByLabelText('Link 1 URL')
    fireEvent.change(input, { target: { value: 'not-a-url' } })
    expect(screen.queryByText(/enter a valid/i)).not.toBeInTheDocument()
  })

  it('shows an error after the field is blurred with an invalid value', () => {
    renderCreateForm()
    const input = screen.getByLabelText('Link 1 URL')
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
    fireEvent.blur(input)
    expect(screen.getByText(/enter a valid http/i)).toBeInTheDocument()
  })

  it('clears the error once a valid URL is entered', () => {
    renderCreateForm()
    const input = screen.getByLabelText('Link 1 URL')
    fireEvent.change(input, { target: { value: 'not-a-url' } })
    fireEvent.blur(input)
    expect(screen.getByText(/enter a valid http/i)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'https://example.com' } })
    expect(screen.queryByText(/enter a valid http/i)).not.toBeInTheDocument()
  })
})

describe('field length limits', () => {
  it('caps the title input at 120 characters via maxLength', () => {
    renderCreateForm()
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxLength', '120')
  })

  it('caps the description textarea at 2000 characters via maxLength', () => {
    renderCreateForm()
    expect(screen.getByLabelText('Description (optional)')).toHaveAttribute(
      'maxLength',
      '2000',
    )
  })

  it('caps a link label at 120 characters via maxLength', () => {
    renderCreateForm()
    expect(screen.getByLabelText('Label (optional)')).toHaveAttribute(
      'maxLength',
      '120',
    )
  })

  it('caps a link URL at 8192 characters via maxLength', () => {
    renderCreateForm()
    expect(screen.getByLabelText('Link 1 URL')).toHaveAttribute(
      'maxLength',
      '8192',
    )
  })

  it('validates the title length explicitly, not only via maxLength, once blurred', () => {
    renderCreateForm()
    const input = screen.getByLabelText('Title')
    fireEvent.change(input, { target: { value: 'a'.repeat(121) } })
    fireEvent.blur(input)
    expect(screen.getByText(/120 characters or fewer/i)).toBeInTheDocument()
  })

  it('validates the description length explicitly once blurred', () => {
    renderCreateForm()
    const textarea = screen.getByLabelText('Description (optional)')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(2001) } })
    fireEvent.blur(textarea)
    expect(screen.getByText(/2000 characters or fewer/i)).toBeInTheDocument()
  })

  it('validates a link label length explicitly once blurred', () => {
    renderCreateForm()
    const labelInput = screen.getByLabelText('Label (optional)')
    fireEvent.change(labelInput, { target: { value: 'a'.repeat(121) } })
    fireEvent.blur(labelInput)
    expect(screen.getByText(/120 characters or fewer/i)).toBeInTheDocument()
  })
})

describe('submission', () => {
  it('blocks submission and surfaces field errors when the form is invalid, without calling onSubmit', () => {
    const onSubmit = renderCreateForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    expect(screen.getByText(/fix the highlighted fields/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a title/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a url/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the current values once the form is valid', () => {
    const onSubmit = renderCreateForm()
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'My mirrors' },
    })
    fillValidLink('https://example.com/a')

    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My mirrors',
        links: [{ id: 'link-0', url: 'https://example.com/a', label: '' }],
      }),
    )
  })

  it('disables the submit button and shows a busy state while submitting', () => {
    renderCreateForm({ submitting: true })
    const button = screen.getByRole('button', { name: /saving/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('does not call onSubmit again while already submitting', () => {
    const onSubmit = vi.fn()
    render(
      <TroveForm
        formMode="create"
        initialValues={{
          ...createInitialValues('link-0'),
          title: 'My mirrors',
          links: [{ id: 'link-0', url: 'https://example.com/a', label: '' }],
        }}
        onSubmit={onSubmit}
        submitLabel="Create trove"
        submitting
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /saving/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders a submitError as an alert without duplicating the field-errors message', () => {
    renderCreateForm({ submitError: 'This feature is not available yet.' })
    expect(
      screen.getByText('This feature is not available yet.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/fix the highlighted fields/i),
    ).not.toBeInTheDocument()
  })
})
