/** Public contracts for the local presentation capability. */

/** Supported Swiss-theme accent presets, one per deck. */
export type PptTheme = 'ikb' | 'lemon' | 'green' | 'orange'

/** Named slide layouts the scaffold understands. */
export type PptLayout = 'cover' | 'kpi' | 'compare' | 'bars' | 'timeline' | 'layers' | 'closing'

/** One KPI tower: a large value and its reading. */
export interface PptMetric {
  /** Display value, including its unit when the unit belongs inside the number. */
  readonly value: string
  /** Short uppercase label drawn under the value. */
  readonly label: string
  /** One-line explanation under the label. */
  readonly note?: string
  /** Relative tower height, 1 to 4. Defaults to 3. */
  readonly size?: 1 | 2 | 3 | 4
}

/** One side of a two-column comparison. */
export interface PptCompareSide {
  /** Uppercase tag above the value, such as DOMESTIC / COLD. */
  readonly tag: string
  /** The large number or short statement. */
  readonly value: string
  /** One-line reading under the value. */
  readonly description?: string
  /** Three to four evidence bullets. */
  readonly bullets?: readonly string[]
}

/** One horizontal bar; value is a percentage and also the bar width. */
export interface PptBar {
  /** Row label. */
  readonly label: string
  /** Percentage from 0 to 100. */
  readonly value: number
  /** Optional display text, such as "67.0%". Defaults to the value plus %. */
  readonly display?: string
}

/** One timeline node. */
export interface PptStep {
  /** Date or short stage label. */
  readonly label: string
  /** Optional value shown under the date. */
  readonly value?: string
}

/** One layer in the three-layer structure. */
export interface PptLayer {
  /** Uppercase layer tag, such as LAYER 01 / DEMAND. */
  readonly tag: string
  /** Layer title. */
  readonly title: string
  /** One paragraph of evidence. */
  readonly description: string
}

/** One closing takeaway. */
export interface PptTakeaway {
  /** Short imperative title. */
  readonly title: string
  /** One or two lines of explanation. */
  readonly description: string
}

/** One slide in a deck. Layout-specific members are optional. */
export interface PptSlide {
  readonly layout: PptLayout
  readonly title: string
  readonly kicker?: string
  readonly lead?: string
  readonly source?: string
  readonly metrics?: readonly PptMetric[]
  readonly left?: PptCompareSide
  readonly right?: PptCompareSide
  readonly bars?: readonly PptBar[]
  readonly steps?: readonly PptStep[]
  readonly layers?: readonly PptLayer[]
  readonly takeaways?: readonly PptTakeaway[]
}

/** The complete deck the scaffold renders. */
export interface PptDeck {
  readonly title: string
  readonly subtitle?: string
  readonly theme?: PptTheme
  readonly slides: readonly PptSlide[]
}

/** Files and facts one export wrote. */
export interface PptExportResult {
  readonly pptxPath: string
  readonly slideCount: number
  readonly bytes: number
  readonly imagesDir: string
}

/** Everything one scaffold wrote, including an optional automatic export. */
export interface PptCreateResult extends Partial<PptExportResult> {
  readonly title: string
  readonly htmlPath: string
  readonly deckPath: string
  readonly slideCount: number
  readonly warnings: readonly string[]
}
