// Online counter: every open tab keeps one tiny WebSocket; the server counts distinct browsers.
import { useEffect, useState } from 'react'

export interface Presence {
  online: number // distinct browsers with the site open
  loggedIn: number
  playing: number // games in progress
  queue: number
}

function browserId() {
  try {
    let id = localStorage.getItem('janggi.browser')
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('')
      localStorage.setItem('janggi.browser', id)
    }
    return id
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('')
  }
}

export function usePresence(): Presence | null {
  const [p, setP] = useState<Presence | null>(null)
  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let retry = 0
    let ping = 0
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/presence?v=${browserId()}`)
      ws.onopen = () => {
        retry = 0
        ping = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('1'), 25000)
      }
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.t === 'presence') setP({ online: m.online, loggedIn: m.loggedIn, playing: m.playing, queue: m.queue })
      }
      ws.onclose = () => {
        clearInterval(ping)
        if (!closed) setTimeout(open, Math.min(15000, 1000 * 2 ** retry++))
      }
    }
    open()
    return () => {
      closed = true
      ws?.close()
    }
  }, [])
  return p
}
