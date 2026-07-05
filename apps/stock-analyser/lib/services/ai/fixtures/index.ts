/**
 * Mock response fixtures for development and testing.
 * Keyed on prompt keywords — matches the logic previously in mockClaudeCall.
 */
import { insufficientDataAnalysis } from '@transformotion/contracts/stock-analyser/structured-output'

export function getMockResponse<T>(prompt: string): T | null {
  if (prompt.includes('comprehensive market analysis') || prompt.includes('Analyse market sectors')) {
    return marketAnalysisFixture() as unknown as T
  }
  if (prompt.includes('Provide stock recommendations')) {
    return recommendationsFixture(prompt) as unknown as T
  }
  if (prompt.includes('Analyse the stock')) {
    return stockAnalysisFixture(prompt) as unknown as T
  }
  if (prompt.includes('precious metals')) {
    return metalsFixture() as unknown as T
  }
  return null
}

function marketAnalysisFixture() {
  return {
    macro: {
      cycleStage: {
        label: "CYCLE STAGE",
        title: "Late Cycle Expansion",
        description: "Economy at capacity constraints with strong growth momentum but rising inflation pressures",
        impact: "Neutral"
      },
      rateDirection: {
        label: "RATE DIRECTION",
        title: "Tightening",
        description: "RBA hiked to 4.35% in March 2026 amid stagflation risks, further hikes likely",
        impact: "Headwind"
      },
      keyRisk: {
        label: "KEY RISK",
        title: "Middle East Conflict Stagflation",
        description: "Oil prices at $93-105 range, inflation expectations rising, RBA warns of nightmare stagflation scenario",
        impact: "Headwind"
      },
      currency: {
        label: "USD / CURRENCY",
        title: "Strong",
        description: "USD index gained 1.4% since Middle East conflict began, safe haven flows amid geopolitical tensions",
        impact: "Supportive"
      }
    },
    briefing: "The ASX faces a challenging macro backdrop as the RBA shifts to aggressive tightening amid stagflation risks. The Middle East conflict has driven oil prices to $93-105 range, forcing the RBA to hike rates to 4.35% with more increases likely. Strong USD and elevated energy costs threaten commodity-dependent sectors, while elevated inflation expectations cloud the outlook despite record market highs in 2024.",
    sectors: [
      { sector: "Financials", signal: "HOLD", cyclePosition: 72, valuation: "Extended", change: 28, reason: "Banks benefit from rising rates but face margin pressure and credit risks in tightening cycle", bestExchange: "ASX" },
      { sector: "Materials", signal: "enter", cyclePosition: 45, valuation: "Attractive", change: -17, reason: "Oversold on China growth fears, energy crisis supports commodity prices medium-term", bestExchange: "TSX" },
      { sector: "Energy", signal: "enter", cyclePosition: 85, valuation: "Cheap", change: -19, reason: "Direct beneficiary of oil crisis, strong free cash flows at elevated prices", bestExchange: "NYSE" },
      { sector: "Healthcare", signal: "HOLD", cyclePosition: 58, valuation: "Fair", change: 27, reason: "Defensive qualities valuable but already well-positioned for stagflation environment", bestExchange: "NASDAQ" },
      { sector: "Technology", signal: "EXIT", cyclePosition: 35, valuation: "Overvalued", change: 48, reason: "Extreme valuations vulnerable to rising rates and economic slowdown", bestExchange: "NASDAQ" },
      { sector: "Industrials", signal: "HOLD", cyclePosition: 55, valuation: "Fair", change: 12, reason: "Mixed outlook with infrastructure spending offset by higher input costs", bestExchange: "NYSE" },
      { sector: "Consumer Discretionary", signal: "EXIT", cyclePosition: 25, valuation: "Expensive", change: 15, reason: "Facing headwinds from rising rates, fuel costs and squeezed consumer spending", bestExchange: "NYSE" },
      { sector: "Real Estate & REITs", signal: "EXIT", cyclePosition: 20, valuation: "Overvalued", change: 41, reason: "Rising rates and tightening cycle pose significant headwinds to property valuations", bestExchange: "ASX" },
    ],
    actionSummary: {
      enter: [
        { sector: "Energy", reason: "Direct beneficiary of oil crisis with strong pricing power and cash generation" },
        { sector: "Materials", reason: "Oversold on China fears, supply constraints support commodity prices" },
        { sector: "Healthcare", reason: "Defensive characteristics valuable in stagflationary environment" },
      ],
      exit: [
        { sector: "Technology", reason: "Extreme valuations vulnerable to rising rates and economic deceleration" },
        { sector: "Real Estate & REITs", reason: "Rising rate environment poses existential threat to property valuations" },
        { sector: "Consumer Discretionary", reason: "Rising fuel costs and rates squeeze discretionary spending power" },
      ]
    }
  }
}

function recommendationsFixture(prompt: string) {
  const isBottomOfCycle = prompt.includes('Bottom of cycle')
  const isEnergyFocus = prompt.includes('Energy') || prompt.includes('energy')

  const energyStocks = [
    { ticker: "WDS.AX", company: "Woodside Energy Group Limited", sector: "Energy", subcategory: "Oil & Gas", price: 33.85, change: 2.2, verdict: "BUY", cyclePosition: 35, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Scarborough project is 94% complete targeting first LNG in Q4 2026 with strong cash flows expected. Louisiana LNG project targeting first production in 2029 positions the company for significant growth in global LNG demand." },
    { ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas", price: 7.45, change: 10.0, verdict: "BUY", cyclePosition: 28, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Pikka Phase 1 project targeting first oil in 2026 will significantly increase production capacity. Current market capitalization of 25.5 billion with strong dividend yield of 4.43% supported by elevated energy prices." },
    { ticker: "ALD.AX", company: "Ampol Limited", sector: "Energy", subcategory: "Refining", price: 34.20, change: 21.3, verdict: "BUY", cyclePosition: 42, cycleStage: "mid", conviction: false, bestExchange: "ASX", analysis: "Strong financial results with Group RCOP EBITDA of 1.4 billion and manageable leverage ratio of 2.3 times. Diesel and jet fuel demand remains strong as key profit drivers for the business." },
    { ticker: "AGL.AX", company: "AGL Energy Limited", sector: "Energy", subcategory: "Utilities", price: 9.84, change: 2.0, verdict: "HOLD", cyclePosition: 52, cycleStage: "mid", conviction: false, bestExchange: "ASX", analysis: "Development pipeline expanded to 11.3 GW with better-than-anticipated battery performance providing transition value. Asset transitions and evolving policy settings create execution risks despite improved earnings stability." },
    { ticker: "ORG.AX", company: "Origin Energy Limited", sector: "Energy", subcategory: "Utilities", price: 8.75, change: 16.0, verdict: "BUY", cyclePosition: 38, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Leading Australia's renewable transition with significant battery storage projects coming online through 2025. Positioned as key beneficiary of clean energy buildout while maintaining income from existing assets." },
    { ticker: "PDN.AX", company: "Paladin Energy Limited", sector: "Energy", subcategory: "Uranium", price: 0.82, change: 7.0, verdict: "BUY", cyclePosition: 32, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Langer Heinrich Mine in Namibia operational with renewed global interest in nuclear power as low-emission energy source. Rising uranium demand and long-term price support provide strong fundamentals for growth." },
  ]

  const bottomCycleStocks = [
    { ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas", price: 6.85, change: -2.15, verdict: "BUY", cyclePosition: 15, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Direct beneficiary of oil crisis with strong pricing power and cash generation. Trading at compressed valuation after recent selloff presents compelling entry point for long-term investors." },
    { ticker: "ORG.AX", company: "Origin Energy", sector: "Energy", subcategory: "Utilities", price: 8.42, change: -1.85, verdict: "BUY", cyclePosition: 18, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Oversold on China growth fears with supply constraints supporting commodity prices. Renewable energy transition creates significant upside as energy transition accelerates globally." },
    { ticker: "REA.AX", company: "REA Group", sector: "Real Estate", subcategory: "Digital Platforms", price: 185.20, change: -0.45, verdict: "BUY", cyclePosition: 22, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Leading property portal with defensive characteristics valuable in stagflationary environment. Positioned to benefit from eventual property market recovery with strong digital moat." },
    { ticker: "APX.AX", company: "Appen Limited", sector: "Technology", subcategory: "AI Data Services", price: 2.15, change: -3.50, verdict: "BUY", cyclePosition: 8, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Critical AI training data provider at inflection point of AI adoption cycle. Extreme selloff creates opportunity as enterprise AI spending accelerates through 2026." },
    { ticker: "Z1P.AX", company: "Zip Co", sector: "Technology", subcategory: "Fintech", price: 0.85, change: -2.80, verdict: "BUY", cyclePosition: 12, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "BNPL operator at cycle trough offering recovery potential as consumer sentiment improves. Strategic partnerships and cost management provide path to profitability." },
    { ticker: "MYR.AX", company: "Myer Holdings", sector: "Consumer Discretionary", subcategory: "Retail", price: 0.78, change: -1.50, verdict: "BUY", cyclePosition: 10, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Deeply depressed valuation with management focused on operational efficiency and inventory optimization. Consumer discretionary cycle turn could unlock significant value." },
  ]

  const defaultStocks = [
    { ticker: "CBA.AX", company: "Commonwealth Bank", sector: "Financials", subcategory: "Banking", price: 115.42, change: 1.85, verdict: "BUY", cyclePosition: 35, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Australia's largest bank with fortress balance sheet and diversified revenue streams. Rising rates support net interest margin expansion while dividend yield remains attractive at 3.2%." },
    { ticker: "CSL.AX", company: "CSL Limited", sector: "Healthcare", subcategory: "Biopharmaceuticals", price: 298.50, change: 2.12, verdict: "BUY", cyclePosition: 28, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Global leader in immune globulins and recombinant therapies with recurring revenue model. Consistent earnings growth and strong pricing power provide defensive characteristics." },
    { ticker: "XRO.AX", company: "Xero Limited", sector: "Technology", subcategory: "Accounting Software", price: 142.50, change: 2.35, verdict: "BUY", cyclePosition: 32, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Cloud-based accounting platform with 3 million+ subscribers across multiple markets. Expanding into financial and operational planning tools creates new revenue opportunities." },
    { ticker: "WTC.AX", company: "WiseTech Global", sector: "Technology", subcategory: "Logistics Software", price: 98.20, change: 1.45, verdict: "BUY", cyclePosition: 45, cycleStage: "mid", conviction: true, bestExchange: "ASX", analysis: "Leading software-as-a-service platform for logistics operations with global customer base. High recurring revenue, strong unit economics, and international expansion driving growth." },
    { ticker: "NXT.AX", company: "NextDC", sector: "Technology", subcategory: "Data Centers", price: 18.45, change: 3.20, verdict: "BUY", cyclePosition: 38, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "AI boom driving unprecedented demand for data center capacity and power infrastructure. Portfolio of hyperscale facilities positioned to capture structural growth in cloud computing." },
    { ticker: "FMG.AX", company: "Fortescue Metals", sector: "Materials", subcategory: "Iron Ore", price: 18.65, change: -0.85, verdict: "SELL", cyclePosition: 82, cycleStage: "peak", conviction: true, bestExchange: "ASX", analysis: "Cyclical iron ore producer at peak cycle facing margin compression from oversupply. China's property slowdown pressures near-term demand and pricing." },
  ]

  return {
    stocks: isEnergyFocus ? energyStocks : isBottomOfCycle ? bottomCycleStocks : defaultStocks,
  }
}

const STOCK_DATA: Record<string, { company: string; sector: string; price: number; change: number; verdict: string; cyclePosition: number; cycleStage: string; summary: string }> = {
  "EIQ.AX": { company: "Echo IQ Limited", sector: "Healthcare", price: 0.895, change: 11.87, verdict: "HOLD", cyclePosition: 85, cycleStage: "peak", summary: "Echo IQ is an AI-powered cardiac diagnostics company with FDA clearance for its heart disease detection technology. While the long-term potential is significant given the massive addressable market, the stock appears overextended after recent gains and faces cash runway concerns with approximately 12 months of funding remaining." },
  "CBA.AX": { company: "Commonwealth Bank of Australia", sector: "Financials", price: 115.42, change: 1.85, verdict: "BUY", cyclePosition: 35, cycleStage: "early", summary: "Australia's largest bank with fortress balance sheet and diversified revenue streams. Rising rates support net interest margin expansion while dividend yield remains attractive. Strong institutional support with solid technical momentum." },
  "BHP.AX": { company: "BHP Group Limited", sector: "Materials", price: 42.80, change: -0.85, verdict: "HOLD", cyclePosition: 55, cycleStage: "mid", summary: "World's largest mining company with diversified commodity exposure. Iron ore and copper operations remain strong but near-term headwinds from China property slowdown. Mid-cycle positioning suggests range-bound trading." },
  "CSL.AX": { company: "CSL Limited", sector: "Healthcare", price: 298.50, change: 2.12, verdict: "BUY", cyclePosition: 28, cycleStage: "early", summary: "Global leader in plasma-derived therapies with strong pricing power and recurring revenue model. Pipeline developments and margin expansion provide upside. Defensive characteristics attractive in current environment." },
  "A200.AX": { company: "BetaShares Australia 200 ETF", sector: "ETF", price: 144.46, change: -0.54, verdict: "HOLD", cyclePosition: 72, cycleStage: "mid", summary: "Broad market ETF tracking the ASX 200 index. Mixed signals with some analysts suggesting hold while awaiting further development, trading within recent support levels." },
  "ETPMAG.AX": { company: "Global X Physical Silver", sector: "ETF", price: 100.53, change: 1.75, verdict: "HOLD", cyclePosition: 40, cycleStage: "mid", summary: "Silver ETF trading 35.7% below 52-week high but still showing strong upward momentum despite elevated volatility. Industrial demand from solar sector provides structural support." },
}

function stockAnalysisFixture(prompt: string) {
  const tickerMatch = prompt.match(/Analyse the stock (\S+)/)
  const ticker = tickerMatch?.[1]?.toUpperCase() || 'UNKNOWN'

  // #603: a designated newly-listed ticker returns the distinguished insufficient-data
  // result, so the degraded UI state is exercisable in local dev + review screenshots.
  if (ticker === 'SPCX' || ticker === 'SPACEX') {
    return insufficientDataAnalysis(ticker)
  }

  const data = STOCK_DATA[ticker] || {
    company: ticker.replace('.AX', '') + ' Limited',
    sector: "Unknown",
    price: 10.00 + Math.random() * 90,
    change: (Math.random() - 0.5) * 10,
    verdict: ["BUY", "HOLD", "SELL"][Math.floor(Math.random() * 3)],
    cyclePosition: Math.floor(Math.random() * 100),
    cycleStage: ["early", "mid", "late", "peak"][Math.floor(Math.random() * 4)],
    summary: `Analysis for ${ticker}. This stock shows mixed technical signals with momentum indicators suggesting caution. Further research recommended before taking positions.`
  }

  return {
    ticker,
    company: data.company,
    sector: data.sector,
    price: data.price,
    change: data.change,
    verdict: data.verdict,
    cyclePosition: data.cyclePosition,
    cycleStage: data.cycleStage,
    signals: [
      { name: "RSI", value: data.cyclePosition > 70 ? "75+" : data.cyclePosition < 30 ? "25" : "50", signal: data.cyclePosition > 70 ? "Bear" : data.cyclePosition < 30 ? "Bull" : "Neutral", label: data.cyclePosition > 70 ? "Overbought territory" : data.cyclePosition < 30 ? "Oversold territory" : "Neutral momentum" },
      { name: "Moving averages", value: data.change > 0 ? "Above 200-day MA" : "Below 200-day MA", signal: data.change > 0 ? "Bull" : "Bear", label: data.change > 0 ? "Long-term uptrend intact" : "Long-term downtrend" },
      { name: "MACD", value: data.verdict === "BUY" ? "Buy signal strengthening" : data.verdict === "SELL" ? "Sell signal active" : "Neutral crossover", signal: data.verdict === "BUY" ? "Bull" : data.verdict === "SELL" ? "Bear" : "Neutral", label: data.verdict === "BUY" ? "Positive momentum building" : data.verdict === "SELL" ? "Negative momentum" : "Consolidating" },
      { name: "Volume", value: data.cycleStage === "early" ? "Accumulation pattern" : data.cycleStage === "peak" ? "Distribution pattern" : "Average volume", signal: data.cycleStage === "early" ? "Bull" : data.cycleStage === "peak" ? "Bear" : "Neutral", label: data.cycleStage === "early" ? "Institutional buying detected" : data.cycleStage === "peak" ? "Smart money exiting" : "Normal trading activity" },
      { name: "P/E ratio", value: data.sector === "Healthcare" ? "N/A" : "18.5", signal: "Neutral", label: data.sector === "Healthcare" ? "Growth company" : "Fair valuation" },
      { name: "Debt / equity", value: "0.45", signal: "Bull", label: "Manageable debt levels" },
    ],
    summary: data.summary,
    risks: [
      "Market volatility and macroeconomic uncertainty",
      "Sector-specific headwinds may impact near-term performance",
      "Technical indicators suggest caution at current levels",
    ],
    rsiDivergence: data.cyclePosition > 70 ? "bearish" : data.cyclePosition < 30 ? "bullish" : "none",
    macdMomentum: data.verdict === "BUY" ? "strengthening" : data.verdict === "SELL" ? "weakening" : "flat",
    volumeTrend: data.cycleStage === "early" ? "confirming" : data.cycleStage === "peak" ? "diverging" : "neutral",
    cycleSummary: `Stock is in ${data.cycleStage} cycle position with ${data.cyclePosition > 70 ? "elevated reversal risk" : data.cyclePosition < 30 ? "recovery potential" : "balanced risk/reward"}.`,
  }
}

function metalsFixture() {
  return {
    metals: [
      { name: "Gold", symbol: "XAU/USD", ticker: "PMGOLD.AX", price: 4754, ytdChange: 14.2, todayChange: -1.19, signal: "NEUTRAL", weekLow: 3873, weekHigh: 5200, perthMintTicker: "PMGOLD.AX", perthMintName: "Perth Mint Gold", analysis: "Elevated geopolitical tensions from US-Iran conflict and Strait of Hormuz blockade continue driving safe-haven demand, though inflation concerns limit central bank rate cuts. Trading range of $4,400–$5,200 expected with bulls targeting $5,000+ amid continued central bank purchases." },
      { name: "Silver", symbol: "XAG/USD", ticker: "ETPMAG.AX", price: 74.78, ytdChange: 67.5, todayChange: -3.81, signal: "BULL", weekLow: 41.60, weekHigh: 89.20, perthMintTicker: "ETPMAG.AX", perthMintName: "Perth Mint Silver", analysis: "Strongest performer among precious metals with energy security driving solar demand acceleration. Industrial headwinds may create volatility but structural energy transition and relative undervaluation versus gold maintain long-term bullish outlook." },
      { name: "Platinum", symbol: "XPT/USD", ticker: "ETPMPT.AX", price: 2048, ytdChange: 81.4, todayChange: -2.29, signal: "BULL", weekLow: 1120, weekHigh: 2180, perthMintTicker: "ETPMPT.AX", perthMintName: "Perth Mint Platinum", analysis: "Trading at historic discount to gold despite supply constraints and deficit conditions. Expected to benefit from elevated lease rates and EV adoption catalysts via hydrogen fuel cells as low-emission energy source with jewelry demand upsides in China." },
      { name: "Palladium", symbol: "XPD/USD", ticker: "ETPMPD.AX", price: 1250, ytdChange: -15.3, todayChange: -2.1, signal: "NEUTRAL", weekLow: 950, weekHigh: 1650, perthMintTicker: "ETPMPD.AX", perthMintName: "Perth Mint Palladium", analysis: "Facing structural headwinds from EV adoption reducing catalytic converter demand and Russian supply normalization. Limited by substitution toward platinum and weakening automotive cycle outlook, though some recovery potential if industrial demand stabilizes." },
    ],
  }
}
