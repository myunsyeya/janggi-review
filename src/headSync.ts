// In-app navigation changes the page without loading it, so the <head> would keep the first page's canonical,
// description, Open Graph, Twitter and JSON-LD tags. After each navigation, take them from that page's own HTML
// (pre-rendered at build time, or rendered by the server for user studies), the same tags crawlers see.
const SELECTOR = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'script[type="application/ld+json"]',
].join(',')

let first = true
let latest = ''
export async function syncHead(path: string) {
  // the first page came with its own head
  if (first) {
    first = false
    return
  }
  latest = path
  try {
    const res = await fetch(path, { headers: { Accept: 'text/html' } })
    if (!res.ok || latest !== path) return
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
    if (latest !== path) return
    document.head.querySelectorAll(SELECTOR).forEach((el) => el.remove())
    doc.head.querySelectorAll(SELECTOR).forEach((el) => document.head.appendChild(document.importNode(el, true)))
    const title = doc.querySelector('title')?.textContent
    if (title) document.title = title
  } catch {
    // offline etc.: keep the tags we have
  }
}
