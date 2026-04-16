/**
 * CMC Markets CSV parser — ported from stock-signal-analyser.html.
 *
 * Supports CMC's Profit & Loss export format.
 * Auto-detects columns by header name, handles gifted shares ($0 cost basis),
 * and normalises ticker symbols to Yahoo Finance format (e.g. CBA → CBA.AX).
 */

import type { PortfolioHolding } from './types'

// ── Column name candidates (CMC Markets P&L export) ───────────────────────────

const TICKER_COLS   = ['code','symbol','ticker','stock','instrument','epic','security','asx code','stock code','share code']
const SHARES_COLS   = ['quantity','units','shares','volume','position','holdings','qty','number of shares','shares held','units held','available to']
const PRICE_COLS    = ['average price','avg price','cost price','purchase price','avg cost','average cost','unit cost','cost per share','entry price','open price','price paid','avg entry','average buy','avg buy price','cost basis per share','avg cost per share','average cost per share','cost per unit','net avg price','net avg price (aud)','net average price','net average price (aud)','net avg price aud','average price (aud)']
const TOTAL_COST_COLS = ['cost (aud)','cost aud','cost(aud)','total cost','total cost (aud)','cost basis','cost basis (aud)','cost basis aud']
const CURR_PRICE_COLS = ['last','last price','current price','market price','price','close','closing price']
const FX_COLS       = ['fx rate','exchange rate','fx','rate']
const CURRENCY_COLS = ['currency','ccy','curr']
const VALUE_COLS    = ['value aud','value (aud)','market value aud','total value aud','market value']

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c)
    if (idx !== -1) return idx
  }
  for (const c of candidates) {
    const idx = header.findIndex(h => h.includes(c) || c.includes(h))
    if (idx !== -1) return idx
  }
  return -1
}

function splitCSVRow(row: string): string[] {
  const result: string[] = []
  let inQuote = false
  let cur = ''
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = '' }
    else { cur += ch }
  }
  result.push(cur)
  return result
}

function normaliseTicker(raw: string): string {
  let t = raw.toUpperCase().replace(/['"]/g, '').trim()
  if (t.includes(':')) {
    const [code, market] = t.split(':')
    if (market === 'US') return code
    if (market === 'AU') return code + '.AX'
    if (market === 'GB' || market === 'UK') return code + '.L'
    return code
  }
  // ASX codes: 2-6 alphanumeric chars with no existing exchange suffix
  if (/^[A-Z][A-Z0-9]{1,5}$/.test(t) && !t.includes('.')) return t + '.AX'
  return t
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SkippedRow {
  row:    number
  ticker: string
  reason: string
}

export interface ParseResult {
  holdings:                 PortfolioHolding[]
  skipped:                  SkippedRow[]
  /** True when current price was used as avg cost placeholder (no cost basis in CSV). */
  usedCurrentPriceAsAvgCost: boolean
}

export function parseCMCCsv(text: string): ParseResult {
  const rows = text.split(/\r?\n/).filter(r => r.trim())
  if (rows.length < 2) throw new Error('CSV appears to be empty or has only one row.')

  const header = splitCSVRow(rows[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

  const tickerIdx    = findCol(header, TICKER_COLS)
  const sharesIdx    = findCol(header, SHARES_COLS)
  const priceIdx     = findCol(header, PRICE_COLS)
  const totalCostIdx = findCol(header, TOTAL_COST_COLS)
  const currPriceIdx = findCol(header, CURR_PRICE_COLS)
  const fxIdx        = findCol(header, FX_COLS)
  const currencyIdx  = findCol(header, CURRENCY_COLS)
  const valueIdx     = findCol(header, VALUE_COLS)

  if (tickerIdx === -1 || sharesIdx === -1) {
    throw new Error(
      'Could not detect ticker or shares column. ' +
      `Found headers: ${header.join(', ')}. ` +
      'Export from CMC Markets → Profit & Loss tab.'
    )
  }

  const useTotalCost = totalCostIdx !== -1
  const effectiveIdx = totalCostIdx !== -1 ? totalCostIdx : priceIdx !== -1 ? priceIdx : currPriceIdx
  const useCurrPrice = totalCostIdx === -1 && priceIdx === -1 && currPriceIdx !== -1

  const holdings: PortfolioHolding[] = []
  const skipped: SkippedRow[]        = []

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i + 1]
    if (!row.trim()) continue

    const cols      = splitCSVRow(row).map(c => c.trim().replace(/^"|"$/g, ''))
    const rawTicker = cols[tickerIdx] ?? ''
    const rawShares = cols[sharesIdx] ?? ''
    const rawPrice  = effectiveIdx !== -1 ? (cols[effectiveIdx] ?? '') : ''
    const rawCurrency = currencyIdx !== -1 ? (cols[currencyIdx] ?? 'AUD') : 'AUD'
    const rawFx     = fxIdx !== -1 ? (cols[fxIdx] ?? '') : ''

    const lower = rawTicker.toLowerCase()
    if (!rawTicker.trim() || lower === 'total' || lower === 'totals' || lower === 'cash') continue

    const ticker  = normaliseTicker(rawTicker)
    const shares  = parseFloat(rawShares.replace(/[,$\s]/g, ''))
    let   rawVal  = parseFloat(rawPrice.replace(/[,$\s]/g, ''))
    const currency = rawCurrency.toUpperCase().trim()
    const fx      = parseFloat(rawFx.replace(/[,$\s]/g, '')) || 1

    if (!ticker || isNaN(shares) || shares <= 0) {
      if (rawTicker.trim()) {
        skipped.push({ row: i + 2, ticker: rawTicker, reason: isNaN(shares) || shares <= 0 ? 'invalid quantity' : 'no ticker' })
      }
      continue
    }

    // Derive per-share avg cost
    let avgCost = rawVal
    if (useTotalCost && !isNaN(rawVal)) {
      avgCost = rawVal === 0 ? 0 : rawVal / shares
    }

    // Convert non-AUD to AUD via FX rate
    if (!isNaN(avgCost) && avgCost > 0 && currency !== 'AUD' && fx !== 1) {
      avgCost = avgCost * fx
    }

    // Fallback: market value ÷ shares
    if ((isNaN(avgCost) || avgCost < 0) && !useTotalCost && valueIdx !== -1) {
      const val = parseFloat((cols[valueIdx] ?? '').replace(/[,$\s]/g, ''))
      if (!isNaN(val) && val > 0) avgCost = val / shares
    }

    // Only skip truly invalid prices — zero is valid for gifted shares
    if (isNaN(avgCost) || avgCost < 0) {
      skipped.push({ row: i + 2, ticker, reason: 'could not determine avg cost' })
      continue
    }

    holdings.push({
      ticker,
      shares,
      avgCost,
      isGifted: avgCost === 0,
      addedAt:  Date.now(),
    })
  }

  if (holdings.length === 0) {
    throw new Error('No valid holdings found. Check the file has ticker, quantity, and price columns.')
  }

  return { holdings, skipped, usedCurrentPriceAsAvgCost: useCurrPrice }
}
