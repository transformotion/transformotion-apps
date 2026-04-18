/**
 * CSV Parser - Business Logic
 * 
 * Pure functions for parsing CSV files.
 * No I/O, no React - can run in browser or Lambda.
 */

export interface ColumnMapping {
  date: number
  description: number
  amount: number       // -1 if using debit/credit
  debit: number        // -1 if using single amount
  credit: number       // -1 if using single amount
}

export interface ParsedTransaction {
  date: string         // DD/MM/YYYY format
  description: string
  amount: number       // Negative = expense, positive = income
  rawDate: string      // Original date string
  rawAmount: string    // Original amount string(s)
}

export interface ParseResult {
  success: boolean
  transactions: ParsedTransaction[]
  errors: ParseError[]
  skippedRows: number
}

export interface ParseError {
  row: number
  message: string
  data?: string[]
}

/**
 * Parse CSV content into rows.
 */
export function parseCSVContent(content: string): string[][] {
  const rows: string[][] = []
  const lines = content.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    
    // Simple CSV parsing (handles quoted fields)
    const row = parseCSVRow(trimmed)
    rows.push(row)
  }
  
  return rows
}

/**
 * Parse a single CSV row handling quoted fields.
 */
export function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // Skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

/**
 * Parse a date string into DD/MM/YYYY format.
 */
export function parseDate(dateStr: string, format: string): string | null {
  const cleaned = dateStr.trim()
  
  try {
    let day: number, month: number, year: number
    
    switch (format) {
      case 'DD/MM/YYYY': {
        const parts = cleaned.split('/')
        if (parts.length !== 3) return null
        day = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        year = parseInt(parts[2], 10)
        break
      }
      
      case 'DD-Mon-YY':
      case 'DD-Mon-YYYY': {
        const match = cleaned.match(/(\d{1,2})-(\w{3})-(\d{2,4})/)
        if (!match) return null
        day = parseInt(match[1], 10)
        month = parseMonthName(match[2])
        year = parseInt(match[3], 10)
        if (year < 100) year += 2000
        break
      }
      
      case 'YYYY-MM-DD': {
        const parts = cleaned.split('-')
        if (parts.length !== 3) return null
        year = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        day = parseInt(parts[2], 10)
        break
      }
      
      case 'MM/DD/YYYY': {
        const parts = cleaned.split('/')
        if (parts.length !== 3) return null
        month = parseInt(parts[0], 10)
        day = parseInt(parts[1], 10)
        year = parseInt(parts[2], 10)
        break
      }
      
      default:
        return null
    }
    
    // Validate
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null
    if (month < 1 || month > 12) return null
    if (day < 1 || day > 31) return null
    
    // Format as DD/MM/YYYY
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`
  } catch {
    return null
  }
}

/**
 * Parse month name to number (1-12).
 */
function parseMonthName(name: string): number {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  return months[name.toLowerCase()] || 0
}

/**
 * Parse an amount string to a number.
 */
export function parseAmount(amountStr: string): number | null {
  if (!amountStr || !amountStr.trim()) return null
  
  // Remove currency symbols, spaces, and handle parentheses for negatives
  let cleaned = amountStr.trim()
    .replace(/[$£€¥,\s]/g, '')
  
  // Handle parentheses as negative
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }
  
  // Handle CR/DR suffixes
  if (cleaned.endsWith('CR')) {
    cleaned = cleaned.slice(0, -2)
  } else if (cleaned.endsWith('DR')) {
    cleaned = '-' + cleaned.slice(0, -2)
  }
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Parse CSV rows into transactions.
 */
export function parseTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  dateFormat: string,
  skipHeaderRows: number = 1
): ParseResult {
  const transactions: ParsedTransaction[] = []
  const errors: ParseError[] = []
  let skippedRows = 0
  
  for (let i = skipHeaderRows; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    
    // Skip empty rows
    if (row.length === 0 || row.every(cell => !cell.trim())) {
      skippedRows++
      continue
    }
    
    // Parse date
    const rawDate = row[mapping.date] || ''
    const date = parseDate(rawDate, dateFormat)
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid date: "${rawDate}"`, data: row })
      continue
    }
    
    // Parse description
    const description = (row[mapping.description] || '').trim()
    if (!description) {
      errors.push({ row: rowNum, message: 'Missing description', data: row })
      continue
    }
    
    // Parse amount
    let amount: number | null = null
    let rawAmount = ''
    
    if (mapping.amount >= 0) {
      // Single amount column
      rawAmount = row[mapping.amount] || ''
      amount = parseAmount(rawAmount)
    } else if (mapping.debit >= 0 || mapping.credit >= 0) {
      // Separate debit/credit columns
      const debitStr = mapping.debit >= 0 ? (row[mapping.debit] || '') : ''
      const creditStr = mapping.credit >= 0 ? (row[mapping.credit] || '') : ''
      rawAmount = `D:${debitStr} C:${creditStr}`
      
      const debit = parseAmount(debitStr) || 0
      const credit = parseAmount(creditStr) || 0
      
      // Credit is positive (income), debit is negative (expense)
      amount = credit - debit
    }
    
    if (amount === null || amount === 0) {
      // Skip zero-amount rows (likely balance or info rows)
      skippedRows++
      continue
    }
    
    transactions.push({
      date,
      description,
      amount,
      rawDate,
      rawAmount,
    })
  }
  
  return {
    success: errors.length === 0,
    transactions,
    errors,
    skippedRows,
  }
}

/**
 * Detect the likely column mapping from CSV headers.
 */
export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {}
  
  const headerLower = headers.map(h => h.toLowerCase().trim())
  
  // Date column
  const dateIndex = headerLower.findIndex(h => 
    h.includes('date') || h === 'when' || h === 'processed date'
  )
  if (dateIndex >= 0) mapping.date = dateIndex
  
  // Description column
  const descIndex = headerLower.findIndex(h =>
    h.includes('description') || h.includes('narration') || 
    h.includes('details') || h.includes('memo') || h.includes('payee')
  )
  if (descIndex >= 0) mapping.description = descIndex
  
  // Amount columns
  const amountIndex = headerLower.findIndex(h => 
    h === 'amount' || h === 'value' || h === 'transaction amount'
  )
  if (amountIndex >= 0) {
    mapping.amount = amountIndex
    mapping.debit = -1
    mapping.credit = -1
  } else {
    mapping.amount = -1
    
    const debitIndex = headerLower.findIndex(h =>
      h === 'debit' || h.includes('debit') || h === 'withdrawal'
    )
    const creditIndex = headerLower.findIndex(h =>
      h === 'credit' || h.includes('credit') || h === 'deposit'
    )
    
    mapping.debit = debitIndex >= 0 ? debitIndex : -1
    mapping.credit = creditIndex >= 0 ? creditIndex : -1
  }
  
  return mapping
}
