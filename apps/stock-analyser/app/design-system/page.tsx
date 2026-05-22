"use client"

import {
  PageHeader,
  ModeToggle,
  SegmentedControl,
  PillSelector,
  CycleGauge,
  SignalBadge,
  VerdictBadge,
  AlertBadge,
  TrendBadge,
  PriceDisplay,
  StockIcon,
  Card,
  StatBox,
  SectionHeader,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  BackLink,
  type Signal,
  type Verdict,
  type TrendSignal,
  type CycleStage,
} from "@transformotion/ui-primitives"
import { Wordmark, BrandMark } from "@/components/brand/wordmark"
import { useState } from "react"
import {
  Search,
  Plus,
  Trash2,
  Star,
  TrendingUp,
  BarChart3,
  Eye,
} from "lucide-react"

export default function DesignSystemPage() {
  const [isLive, setIsLive] = useState(false)
  const [geo, setGeo] = useState<"ASX" | "US" | "UK" | "Global">("ASX")
  const [category, setCategory] = useState<"All" | "Index" | "Sector" | "Bond">("All")

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Transformotion Design System
          </h1>
          <p className="text-muted-foreground">
            Unified components for visual consistency across all screens
          </p>
        </div>

        {/* Brand */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Brand Identity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-xs text-muted-foreground mb-3">Wordmark Large</p>
              <Wordmark size="lg" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-3">Wordmark Medium</p>
              <Wordmark size="md" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-3">Wordmark Small</p>
              <Wordmark size="sm" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-3">Brand Mark - Initial</p>
              <BrandMark variant="initial" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-3">Brand Mark - Dot</p>
              <BrandMark variant="dot" />
            </Card>
          </div>
        </section>

        {/* Colors */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Color Palette
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-background border border-border" />
              <p className="text-xs text-muted-foreground">Background</p>
              <p className="text-[10px] font-mono text-foreground">#0D1B2A</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-card border border-border" />
              <p className="text-xs text-muted-foreground">Card</p>
              <p className="text-[10px] font-mono text-foreground">#141720</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-surface2" />
              <p className="text-xs text-muted-foreground">Surface2</p>
              <p className="text-[10px] font-mono text-foreground">#1c2030</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-primary" />
              <p className="text-xs text-muted-foreground">Primary (Teal)</p>
              <p className="text-[10px] font-mono text-foreground">#00C4B3</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-signal-gold" />
              <p className="text-xs text-muted-foreground">Gold</p>
              <p className="text-[10px] font-mono text-foreground">#E8A838</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-signal-green" />
              <p className="text-xs text-muted-foreground">Signal Green</p>
              <p className="text-[10px] font-mono text-foreground">#22c87a</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-signal-amber" />
              <p className="text-xs text-muted-foreground">Signal Amber</p>
              <p className="text-[10px] font-mono text-foreground">#f0a030</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-signal-red" />
              <p className="text-xs text-muted-foreground">Signal Red</p>
              <p className="text-[10px] font-mono text-foreground">#f05656</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-foreground" />
              <p className="text-xs text-muted-foreground">Foreground</p>
              <p className="text-[10px] font-mono text-foreground">#e8eaf0</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-muted-foreground" />
              <p className="text-xs text-muted-foreground">Muted</p>
              <p className="text-[10px] font-mono text-foreground">#6b7280</p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Typography Scale
          </h2>
          <Card>
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-3xl font-semibold text-foreground">$2,847.50</span>
                <span className="text-xs text-muted-foreground">text-3xl - Featured prices</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-2xl font-semibold text-foreground">$1,234.00</span>
                <span className="text-xs text-muted-foreground">text-2xl - Hero numbers</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-xl font-semibold text-foreground">$156.78</span>
                <span className="text-xs text-muted-foreground">text-xl - Large numbers</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-lg font-semibold text-foreground">Page Title</span>
                <span className="text-xs text-muted-foreground">text-lg - Page titles</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-base font-medium text-foreground">Section Header</span>
                <span className="text-xs text-muted-foreground">text-base - Section headers</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-sm text-foreground">Body text and card content</span>
                <span className="text-xs text-muted-foreground">text-sm - Body text</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <span className="text-xs text-muted-foreground">Secondary text and hints</span>
                <span className="text-xs text-muted-foreground">text-xs - Secondary text</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">LABEL TEXT</span>
                <span className="text-xs text-muted-foreground">text-[10px] - Labels, badges</span>
              </div>
            </div>
          </Card>
        </section>

        {/* Spacing */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Spacing Rhythm
          </h2>
          <Card>
            <div className="space-y-3">
              {[
                { name: "xs", value: "4px", class: "gap-1, p-1" },
                { name: "sm", value: "8px", class: "gap-2, p-2" },
                { name: "md", value: "12px", class: "gap-3, p-3" },
                { name: "lg", value: "16px", class: "gap-4, p-4" },
                { name: "xl", value: "20px", class: "gap-5, p-5" },
                { name: "2xl", value: "24px", class: "gap-6, p-6" },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-4">
                  <div 
                    className="bg-primary shrink-0" 
                    style={{ width: item.value, height: "24px" }}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({item.value})</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{item.class}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Page Header */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Page Header
          </h2>
          <Card>
            <PageHeader
              title="Market Analysis"
              subtitle="AI-powered sector rotation signals"
              action={<ModeToggle isLive={isLive} onToggle={() => setIsLive(!isLive)} />}
            />
          </Card>
        </section>

        {/* Mode Toggle */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Mode Toggle
          </h2>
          <div className="flex gap-4">
            <Card className="inline-flex">
              <ModeToggle isLive={false} onToggle={() => {}} />
            </Card>
            <Card className="inline-flex">
              <ModeToggle isLive={true} onToggle={() => {}} />
            </Card>
          </div>
        </section>

        {/* Navigation Controls */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Navigation Controls
          </h2>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Segmented Control</p>
            <SegmentedControl
              options={["ASX", "US", "UK", "Global"] as const}
              value={geo}
              onChange={setGeo}
            />
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Pill Selector</p>
            <PillSelector
              options={["All", "Index", "Sector", "Bond"] as const}
              value={category}
              onChange={setCategory}
            />
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Back Link</p>
            <BackLink label="Back to Market Analysis" onClick={() => {}} />
          </Card>
        </section>

        {/* Signals & Verdicts */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Signals & Verdicts
          </h2>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Signal Badges</p>
            <div className="flex flex-wrap gap-2">
              {(["ENTER", "EXIT", "HOLD", "WATCH"] as Signal[]).map((signal) => (
                <SignalBadge key={signal} signal={signal} />
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Verdict Badges</p>
            <div className="flex flex-wrap gap-2">
              {(["BUY", "HOLD", "SELL", "NEUTRAL"] as Verdict[]).map((verdict) => (
                <VerdictBadge key={verdict} verdict={verdict} />
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Trend Badges</p>
            <div className="flex flex-wrap gap-2">
              {(["BULL", "NEUTRAL", "BEAR"] as TrendSignal[]).map((trend) => (
                <TrendBadge key={trend} trend={trend} />
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Alert Badges</p>
            <div className="flex flex-col gap-2">
              <AlertBadge type="accumulate" />
              <AlertBadge type="late-stage" />
              <AlertBadge type="sell" value={12450} />
            </div>
          </Card>
        </section>

        {/* Cycle Gauge */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Cycle Gauge
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["early", "mid", "late", "peak"] as CycleStage[]).map((stage, i) => (
              <Card key={stage}>
                <CycleGauge 
                  position={[22, 45, 72, 88][i]} 
                  stage={stage}
                  showLabels={true}
                  size="md"
                />
              </Card>
            ))}
          </div>
        </section>

        {/* Price Display */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Price Display
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-xs text-muted-foreground mb-2">Large</p>
              <PriceDisplay price={2847.50} change={2.34} size="lg" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-2">Medium</p>
              <PriceDisplay price={156.78} change={-1.23} size="md" />
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground mb-2">Small</p>
              <PriceDisplay price={42.50} change={0.45} size="sm" />
            </Card>
          </div>
        </section>

        {/* Stock Icons */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Stock Icons
          </h2>
          <Card>
            <div className="flex items-center gap-4">
              <StockIcon ticker="CBA.AX" size="lg" />
              <StockIcon ticker="BHP.AX" size="md" />
              <StockIcon ticker="CSL.AX" size="sm" />
            </div>
          </Card>
        </section>

        {/* Stat Boxes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Stat Boxes
          </h2>
          <Card>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="VIX" value="18.2" change={-5.2} />
              <StatBox label="DXY" value="104.8" change={0.3} />
              <StatBox label="10Y" value="4.25%" change={2.1} />
            </div>
          </Card>
        </section>

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Buttons
          </h2>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Primary Button</p>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton icon={TrendingUp}>Run Analysis</PrimaryButton>
              <PrimaryButton>Confirm</PrimaryButton>
              <PrimaryButton disabled>Disabled</PrimaryButton>
            </div>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Secondary Button</p>
            <div className="flex flex-wrap gap-3">
              <SecondaryButton icon={Search}>Search</SecondaryButton>
              <SecondaryButton>Cancel</SecondaryButton>
            </div>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">Icon Buttons</p>
            <div className="flex gap-3">
              <IconButton icon={Plus} />
              <IconButton icon={Star} />
              <IconButton icon={Eye} />
              <IconButton icon={Trash2} variant="destructive" />
            </div>
          </Card>
        </section>

        {/* Cards */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Card Styles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <p className="text-xs text-muted-foreground mb-2">Standard Card</p>
              <p className="text-sm text-foreground">Default card with border and padding.</p>
            </Card>
            <Card interactive onClick={() => {}}>
              <p className="text-xs text-muted-foreground mb-2">Interactive Card</p>
              <p className="text-sm text-foreground">Hover and click enabled.</p>
            </Card>
          </div>
        </section>

        {/* Section Header */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Section Header
          </h2>
          <Card>
            <SectionHeader 
              title="Top Picks" 
              action={<button className="text-xs text-primary">View all</button>}
            />
            <p className="text-sm text-muted-foreground">Content goes here...</p>
          </Card>
        </section>

        {/* Empty State */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Empty State
          </h2>
          <Card>
            <EmptyState
              icon={BarChart3}
              title="No analysis yet"
              description="Select a geography and tap Run Analysis to see sector rotation signals."
              action={<PrimaryButton icon={TrendingUp}>Run Analysis</PrimaryButton>}
            />
          </Card>
        </section>

        {/* Sample Stock Card */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
            Sample Composed Card
          </h2>
          <Card interactive>
            <div className="flex items-start gap-3">
              <StockIcon ticker="CBA.AX" size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-sm font-semibold text-foreground">CBA.AX</span>
                    <span className="text-xs text-muted-foreground ml-2">Commonwealth Bank</span>
                  </div>
                  <VerdictBadge verdict="BUY" size="sm" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <PriceDisplay price={115.42} change={1.85} size="sm" />
                  <span className="text-[10px] text-muted-foreground">Financials</span>
                </div>
                <CycleGauge position={35} stage="early" showLabels={false} size="sm" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
