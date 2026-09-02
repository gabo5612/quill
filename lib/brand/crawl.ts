import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Fetches a public web page and reduces it to plain text.
 *
 * The URL comes from a form field, so every fetch here is a potential SSRF:
 * without validation an editor could point this at `http://169.254.169.254/`
 * and read cloud instance metadata, or at an internal hostname that only the
 * server can reach. Everything below exists to make that impossible.
 */

const MAX_BYTES = 2_000_000       // 2 MB of HTML is already a huge page
const FETCH_TIMEOUT_MS = 15_000
const MAX_PAGES = 5

export class UnsafeUrlError extends Error {}

/**
 * Expands an IPv6 address to its 16 bytes.
 *
 * Text matching on IPv6 is a reliable way to ship an SSRF hole: the same
 * address has many spellings, and Node rewrites `::ffff:10.0.0.1` into
 * `::ffff:a00:1` before you ever see it. Comparing bytes is the only form that
 * cannot be spelled around.
 */
function ipv6ToBytes(ip: string): number[] | null {
  let text = ip
  const bytes: number[] = []

  // A trailing dotted quad (::ffff:10.0.0.1) contributes the last four bytes.
  const dotted = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  let tail: number[] = []
  if (dotted) {
    tail = dotted[1].split('.').map(Number)
    if (tail.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null
    text = text.slice(0, dotted.index).replace(/:$/, '') + ':'
    if (text === ':') text = '::'
  }

  const [head, rest, extra] = text.split('::')
  if (extra !== undefined) return null // more than one "::" is invalid

  const toBytes = (group: string): number[] | null => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    const value = parseInt(group, 16)
    return [value >> 8, value & 0xff]
  }

  const headGroups = head ? head.split(':').filter(Boolean) : []
  const restGroups = rest ? rest.split(':').filter(Boolean) : []

  const left: number[] = []
  for (const g of headGroups) {
    const b = toBytes(g)
    if (!b) return null
    left.push(...b)
  }

  const right: number[] = []
  for (const g of restGroups) {
    const b = toBytes(g)
    if (!b) return null
    right.push(...b)
  }
  right.push(...tail)

  if (rest === undefined) {
    // No "::" — the address must be fully specified.
    bytes.push(...left, ...tail)
    return bytes.length === 16 ? bytes : null
  }

  const zeros = 16 - left.length - right.length
  if (zeros < 0) return null
  return [...left, ...new Array(zeros).fill(0), ...right]
}

function isPrivateIPv4Bytes(b: number[]): boolean {
  if (b[0] === 10) return true                               // 10/8
  if (b[0] === 127) return true                              // loopback
  if (b[0] === 0) return true                                // 0/8
  if (b[0] === 169 && b[1] === 254) return true              // link-local (cloud metadata)
  if (b[0] === 172 && b[1] >= 16 && b[1] <= 31) return true  // 172.16/12
  if (b[0] === 192 && b[1] === 168) return true              // 192.168/16
  if (b[0] === 100 && b[1] >= 64 && b[1] <= 127) return true // CGNAT
  if (b[0] >= 224) return true                               // multicast / reserved
  return false
}

/** Blocks loopback, link-local, unique-local and every RFC1918 range, v4 and v6. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const b = ipv6ToBytes(ip.toLowerCase())
    if (!b) return true // unparseable: refuse rather than guess

    const allZero = b.every(x => x === 0)
    if (allZero) return true                                   // ::
    if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return true // ::1

    if ((b[0] & 0xfe) === 0xfc) return true                    // fc00::/7 unique-local
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true   // fe80::/10 link-local
    if (b[0] === 0xff) return true                             // ff00::/8 multicast

    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96): judge the
    // embedded IPv4 address, which is what the connection actually reaches.
    const first10Zero = b.slice(0, 10).every(x => x === 0)
    if (first10Zero && b[10] === 0xff && b[11] === 0xff) {
      return isPrivateIPv4Bytes(b.slice(12))
    }
    if (first10Zero && b[10] === 0 && b[11] === 0) {
      return isPrivateIPv4Bytes(b.slice(12))
    }

    // 64:ff9b::/96 NAT64 also carries an embedded IPv4 address.
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
      return isPrivateIPv4Bytes(b.slice(12))
    }

    return false
  }

  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  return isPrivateIPv4Bytes(p)
}

/**
 * Validates the URL and resolves its hostname, rejecting anything that points
 * inside the network. Returns the parsed URL when it is safe to fetch.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are supported.')
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError('URLs with embedded credentials are not allowed.')
  }

  // Node keeps the brackets on IPv6 hostnames ("[::1]"), which makes isIP()
  // fail and sends the address down the DNS path. It still gets blocked there,
  // but only by accident — strip them so the private-address check runs.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('That host is not reachable from the public internet.')
  }

  // A literal IP skips DNS; anything else has to resolve to a public address.
  const literal = isIP(host) ? host : null
  if (literal) {
    if (isPrivateAddress(literal)) {
      throw new UnsafeUrlError('That address is on a private network.')
    }
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${host}.`)
  }

  if (addresses.length === 0 || addresses.some(a => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError('That host resolves to a private network address.')
  }

  return url
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', uuml: 'ü',
  iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  euro: '€', pound: '£', deg: '°', reg: '®', copy: '©', trade: '™',
}

/** Strips scripts, styles and markup, leaving readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep block boundaries so sentences don't run together.
    .replace(/<\/(p|div|section|article|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // Spanish copy is full of accented entities; leaving them raw would feed
    // "m&aacute;s" to the model as if that were the brand's voice.
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      // Uppercase forms (&Aacute;) map to the uppercase character.
      const lower = NAMED_ENTITIES[name.toLowerCase()]
      if (!lower) return match
      return name[0] === name[0].toUpperCase() && /^[a-z]/.test(name.slice(1))
        ? lower.toUpperCase()
        : lower
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? htmlToText(m[1]) : null
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1].trim()
  }
  return null
}

/** Same-origin links worth following, in rough order of usefulness. */
function pickInternalLinks(html: string, base: URL, limit: number): string[] {
  const interesting = /(about|nosotros|quienes|company|empresa|servicios|services|productos|products|soluciones|solutions)/i
  const seen = new Set<string>()
  const picked: string[] = []

  for (const m of html.matchAll(/<a\b[^>]+href=["']([^"'#]+)["']/gi)) {
    let href: URL
    try {
      href = new URL(m[1], base)
    } catch {
      continue
    }
    if (href.origin !== base.origin) continue
    href.hash = ''
    const key = href.toString()
    if (key === base.toString() || seen.has(key)) continue
    if (!interesting.test(href.pathname)) continue
    seen.add(key)
    picked.push(key)
    if (picked.length >= limit) break
  }

  return picked
}

async function fetchPage(url: URL): Promise<string> {
  const response = await fetch(url, {
    redirect: 'error', // a redirect could land somewhere private, re-validate instead
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Identify honestly so a site owner can block us if they want to.
      'User-Agent': 'MAGContentTool/1.0 (+brand profile import)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) throw new Error(`${url.origin} responded ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) {
    throw new Error(`Expected HTML from ${url.pathname}, got ${contentType || 'no content type'}`)
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('That page is too large to read.')
  }
  return new TextDecoder().decode(buffer)
}

export interface CrawlResult {
  origin: string
  title: string | null
  description: string | null
  /** Concatenated readable text from the pages that were fetched. */
  text: string
  pagesFetched: string[]
  notes: string[]
}

/**
 * Reads the landing page and up to a handful of obviously-relevant internal
 * pages (about, services, products). Deliberately shallow — this is meant to
 * seed a brand profile a human then edits, not to mirror the site.
 */
export async function crawlSite(rawUrl: string): Promise<CrawlResult> {
  const base = await assertPublicUrl(rawUrl)
  const notes: string[] = []

  const rootHtml = await fetchPage(base)
  const pagesFetched = [base.toString()]

  const parts = [htmlToText(rootHtml)]

  for (const link of pickInternalLinks(rootHtml, base, MAX_PAGES - 1)) {
    try {
      const safe = await assertPublicUrl(link)
      parts.push(htmlToText(await fetchPage(safe)))
      pagesFetched.push(link)
    } catch (error) {
      notes.push(`Skipped ${link}: ${error instanceof Error ? error.message : 'unreadable'}`)
    }
  }

  return {
    origin: base.origin,
    title: extractTag(rootHtml, 'title'),
    description: extractMeta(rootHtml, 'description'),
    // Cap the total so a sprawling site can't blow past the model's context.
    text: parts.join('\n\n').slice(0, 60_000),
    pagesFetched,
    notes,
  }
}
