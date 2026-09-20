import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { canonicalUrl, getRouteMetadata } from './metadata'

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.dataset.vultroveMetadata = 'true'
    document.head.append(element)
  }
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
}

function removeMeta(selector: string) {
  document.head.querySelector(selector)?.remove()
}

function setCanonical(url: string | undefined) {
  const existing = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )
  if (url === undefined) {
    existing?.remove()
    return
  }

  const element = existing ?? document.createElement('link')
  element.rel = 'canonical'
  element.href = url
  element.dataset.vultroveMetadata = 'true'
  if (!existing) {
    document.head.append(element)
  }
}

export function RouteMetadata() {
  const { pathname } = useLocation()

  useEffect(() => {
    const metadata = getRouteMetadata(pathname)
    const canonical = canonicalUrl(metadata)

    document.title = metadata.title
    setMeta('meta[name="robots"]', {
      name: 'robots',
      content: metadata.robots,
    })

    if (metadata.description === undefined) {
      removeMeta('meta[name="description"]')
    } else {
      setMeta('meta[name="description"]', {
        name: 'description',
        content: metadata.description,
      })
    }

    setCanonical(canonical)

    if (!metadata.openGraph || !metadata.description || !canonical) {
      for (const property of [
        'og:type',
        'og:site_name',
        'og:title',
        'og:description',
        'og:url',
      ]) {
        removeMeta(`meta[property="${property}"]`)
      }
      return
    }

    const openGraph = {
      'og:type': 'website',
      'og:site_name': 'vultrove',
      'og:title': metadata.title,
      'og:description': metadata.description,
      'og:url': canonical,
    }
    for (const [property, content] of Object.entries(openGraph)) {
      setMeta(`meta[property="${property}"]`, { property, content })
    }
  }, [pathname])

  return null
}
