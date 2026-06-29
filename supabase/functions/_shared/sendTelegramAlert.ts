// @ts-nocheck

export type IapEventType =
  | 'purchase'
  | 'renewal'
  | 'restore'
  | 'discount'
  | 'failed'
  | 'expired'
  | 'cancelled'

export interface TelegramAlertPayload {
  eventType:     IapEventType
  appName:       string
  plan:          string
  productId:     string
  transactionId: string
  userId:        string
  store:         string
  source:        string
}

const EMOJI: Record<IapEventType, string> = {
  purchase:   '💰',
  renewal:    '🔄',
  restore:    '♻️',
  discount:   '🏷️',
  failed:     '❌',
  expired:    '⏰',
  cancelled:  '🚫',
}

const LABEL: Record<IapEventType, string> = {
  purchase:   'New Purchase',
  renewal:    'Subscription Renewal',
  restore:    'Restore Purchase',
  discount:   'Discount Purchase',
  failed:     'Receipt Validation Failed',
  expired:    'Subscription Expired',
  cancelled:  'Subscription Cancelled',
}

function formatTimestamp(): string {
  try {
    return new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }) + ' EST'
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Sends a Telegram message to the configured chat.
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from env.
 * Never throws — logs errors to console instead.
 */
export async function sendTelegramAlert(payload: TelegramAlertPayload): Promise<void> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId   = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!botToken || !chatId) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set — skipping alert')
    return
  }

  const emoji = EMOJI[payload.eventType] ?? '📣'
  const label = LABEL[payload.eventType] ?? payload.eventType

  const lines = [
    `${emoji} ${label}`,
    `App: ${payload.appName}`,
    `Plan: ${payload.plan}`,
    `Product ID: ${payload.productId}`,
    `Transaction ID: ${payload.transactionId}`,
    `User ID: ${payload.userId}`,
    `Store: ${payload.store}`,
    `Source: ${payload.source}`,
    `Timestamp: ${formatTimestamp()}`,
  ]

  const text = lines.join('\n')
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable body)')
      console.error(`[Telegram] sendMessage failed — status=${res.status} body=${body}`)
    } else {
      console.log(`[Telegram] Alert sent — eventType=${payload.eventType} txId=${payload.transactionId}`)
    }
  } catch (err) {
    console.error('[Telegram] Network error during sendMessage:', err)
  }
}
