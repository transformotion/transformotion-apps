/**
 * Shared data types for the Stock Signal Analyser tabs.
 * Centralised here so the Zustand store and page components can share them
 * without circular imports.
 */

import type { CyclePosition } from '@transformotion/cycle-engine';

// ── Market Analysis ───────────────────────────────────────────────────────────

export type GeoMarket = 'Global' | 'ASX' | 'US' | 'UK';

export interface MacroData {
  cycleStage:    string; cyclePill:    string; cycleNote:    string;
  rateDirection: string; ratePill:     string; rateNote:     string;
  keyRisk:       string; riskPill:     string; riskNote:     string;
  usdStrength:   string; usdPill:      string; usdNote:      string;
}

export interface Sector {
  name:       string;
  signal:     'BUY' | 'HOLD' | 'EXIT';
  momentum:   number;
  valuation:  string;
  ytd:        string;
  thesis:     string;
  bestMarket: string;
}

export interface ActionItem { sector: string; reason: string; }

export interface MarketData {
  geo:       string;
  asOf:      string;
  macro:     MacroData;
  narrative: string;
  sectors:   Sector[];
  enter:     ActionItem[];
  exit:      ActionItem[];
}

// ── Recommendations ───────────────────────────────────────────────────────────

export type RecsMarket = 'ASX' | 'NASDAQ' | 'Dow Jones' | 'FTSE';
export type RecsMode   = 'top' | 'bottom';

export interface StockPick {
  ticker:       string;
  companyName:  string;
  sector:       string;
  verdict:      string;
  currentPrice: string;
  priceChange:  string;
  reason:       string;
}

export interface RecsData {
  market: string;
  asOf:   string;
  stocks: StockPick[];
}

// ── ETFs ──────────────────────────────────────────────────────────────────────

export type EtfMarket = 'ASX' | 'US' | 'Global';

export interface EtfPick {
  ticker:       string;
  companyName:  string;
  sector:       string;
  verdict:      string;
  currentPrice: string;
  priceChange:  string;
  reason:       string;
}

export interface EtfsData {
  market: string;
  asOf:   string;
  stocks: EtfPick[];
}

// ── Precious Metals ───────────────────────────────────────────────────────────

export interface MetalData {
  name:             string;
  symbol:           string;
  asxEtf:           string;
  asxEtfName:       string;
  spotPrice:        string;
  priceChange:      string;
  ytdReturn:        string;
  ytdValue:         number;
  signal:           'bull' | 'neutral' | 'bear';
  fiftyTwoWeekHigh: string;
  fiftyTwoWeekLow:  string;
  outlook:          string;
}

export interface MetalsResponse {
  asOf:   string;
  metals: MetalData[];
}

// ── Analyser ──────────────────────────────────────────────────────────────────

export interface SignalItem {
  value:  string;
  signal: 'bull' | 'bear' | 'neutral';
  note:   string;
}

export interface AnalysisData {
  ticker:         string;
  companyName:    string;
  exchange:       string;
  type:           string;
  verdict:        'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL';
  verdictReason:  string;
  currentPrice:   string;
  priceChange:    string;
  cyclePosition?: CyclePosition;
  signals: {
    rsi:           SignalItem;
    movingAverage: SignalItem;
    macd:          SignalItem;
    volume:        SignalItem;
    pe:            SignalItem;
    roe:           SignalItem;
    debtEquity:    SignalItem;
    fcfYield:      SignalItem;
  };
  summary:  string;
  keyRisks: string[];
  dataNote: string;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistAnalysis {
  ticker:         string;
  companyName?:   string;
  exchange?:      string;
  type?:          string;
  currentPrice?:  string;
  priceChange?:   string;
  verdict?:       string;
  verdictReason?: string;
  cycleScore?:    number;
  cycleStage?:    string;
  cachedAt?:      string;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface HoldingAnalysis {
  ticker:           string;
  companyName?:     string;
  exchange?:        string;
  currentPrice?:    string;
  currentPriceAUD?: number;
  priceChange?:     string;
  verdict?:         string;
  verdictReason?:   string;
  summary?:         string;
  cycleScore?:      number;
  cycleStage?:      string;
}
