/**
 * Local presentation capability, host half: the scaffold/export tools and their
 * bundled Swiss template. The tools are mounted per agent preset; this entry
 * exists for the package's main export and for deployments that prefer to load
 * the tools directly.
 *
 * @module @deepseek-ai/dsh-ppt-local
 */

export { apply, inject, name, registerPptTools } from './tools.ts'
export { exportDeck, renderSlides } from './export.ts'
export { renderDeck } from './render.ts'
export type {
  PptBar,
  PptCompareSide,
  PptCreateResult,
  PptDeck,
  PptExportResult,
  PptLayer,
  PptLayout,
  PptMetric,
  PptSlide,
  PptStep,
  PptTakeaway,
  PptTheme,
} from './types.ts'
