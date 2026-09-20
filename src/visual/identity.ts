/** Cosmetic-only entropy. Never import application, API, crypto or routing modules here. */
export type Seed = readonly [number, number, number, number]
export function randomSeed(): Seed {
  const words = crypto.getRandomValues(new Uint32Array(4))
  return [words[0]!, words[1]!, words[2]!, words[3]!]
}

// sfc32: deterministic visual composition; never suitable for security use.
export function visualRandom(seed: Seed) {
  let [a, b, c, d] = seed
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (((c << 21) | (c >>> 11)) + t) | 0
    return (t >>> 0) / 4294967296
  }
}
export type Point = readonly [number, number, number]
export function makeIdentity(seed: Seed) {
  const random = visualRandom(seed)
  const dots: string[] = []
  const phase = random() * 6.28
  // Bilateral raster field: tapered ears, cheek planes, and a narrow lower point.
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 48; x++) {
      const edge = 36 - y * 0.38 + Math.sin(y * 0.12 + phase) * 7
      const density = Math.max(0, 1 - Math.abs(x - edge) / 15) * 0.72
      if (random() < density) {
        dots.push(
          `M${192 + x * 4} ${y * 4}h1v1h-1z`,
          `M${192 - x * 4} ${y * 4}h1v1h-1z`,
        )
      }
    }
  }
  const sigil: string[] = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 5; x++) {
      if (
        (y < 3 && x >= 3 - y) ||
        (y >= 3 && x <= (9 - y) / 2 && random() > 0.35)
      ) {
        sigil.push(`M${5 + x} ${y}h1v1h-1z`, `M${4 - x} ${y}h1v1h-1z`)
      }
    }
  }
  const lines = Array.from({ length: 7 }, (_, i) => {
    const y = 14 + i * 30 + random() * 12
    return `M0 ${y}H${90 + random() * 80}L${200 + random() * 70} ${y + 26}H384`
  }).join('')
  // Paired folded vanes evoke ears and a tapered muzzle without a literal outline.
  const points: Point[] = []
  const edges: [number, number][] = []
  const spread = 0.85 + random() * 0.25
  for (const side of [-1, 1]) {
    for (let ring = 0; ring < 4; ring++) {
      const z = (ring - 1.5) * 0.45
      const offset = points.length
      points.push(
        [side * 0.16, -0.2, z],
        [side * spread, -1.1 + ring * 0.08, z],
        [side * 1.15, 0.12, z],
        [side * 0.18, 1, z],
      )
      for (let k = 0; k < 4; k++) {
        edges.push([offset + k, offset + ((k + 1) % 4)])
        if (ring) edges.push([offset + k - 4, offset + k])
      }
    }
  }
  return {
    dots: dots.join(''),
    sigil: sigil.join(''),
    lines,
    points,
    edges,
    glyphs: Array.from(
      { length: 8 },
      () => ['┼', '└', '╳', '┐', '·'][Math.floor(random() * 5)],
    ).join('  '),
  }
}
export type Identity = ReturnType<typeof makeIdentity>
