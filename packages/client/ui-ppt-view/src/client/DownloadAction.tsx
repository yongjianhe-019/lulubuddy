/** Document-header download for a generated deck: preview HTML, then fetch the sibling PPTX. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { downloadHref, fileName } from './model.ts'
import css from './PptView.module.css'

/** Full props of the document-header contribution. */
export type PptDownloadActionProps =
  PropsRuntime<'sidebar.right.tab.document.actions'>
  & PropsLocale<'ppt'>

/** The sibling PPTX for one generated deck, or null for an unrelated file. */
function pptxTarget(path: string): string | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pptx')) return path
  if ((lower.endsWith('.html') || lower.endsWith('.htm')) && path.includes('/presentations/')) {
    return path.replace(/\.(?:html?|HTML?)$/u, '.pptx')
  }
  return null
}

/**
 * Render a download action in the document preview header.
 * @param props - file path and localized copy.
 * @returns the download link, or null for a file that is not a deck.
 */
export function PptDownloadAction({ absolutePath, t }: PptDownloadActionProps) {
  const target = pptxTarget(absolutePath)
  if (target === null) return null
  return (
    <a className={css.toolbarDownload} href={downloadHref(target)} download={fileName(target)}
      title={t('action.downloadAria')} aria-label={t('action.downloadAria')}>
      ↓ {t('action.download')}
    </a>
  )
}
