/** Presentation card dictionaries. */

/** The namespace every key belongs to. */
export const NS = 'ppt'

/** Chinese copy. */
export const zh = {
  'card.title': '演示文稿',
  'card.subtitle': '瑞士风 · 16:9',
  'status.ready': '已生成',
  'status.partial': 'HTML 已生成',
  'kpi.slides': '页数',
  'kpi.format': '格式',
  'kpi.size': '大小',
  'action.preview': '预览',
  'action.previewAria': '在右侧栏预览 HTML 演示文稿',
  'action.download': '下载 PPTX',
  'action.downloadAria': '下载 PPTX 文件',
  'unit.slides': '{value} 页',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',
  'unit.format': 'PPTX',
  'warnings.title': '导出提示',
  'note.partial': 'PPTX 尚未导出。预览 HTML 后可以让 Agent 重新导出。',
  'note.download': '下载的是高保真图片版 PPTX；页面视觉与 HTML 一致，文字不可编辑。',
  'fallback.title': '演示文稿',
  'fallback.running': '正在生成…',
  'path.html': 'HTML',
  'path.pptx': 'PPTX',
} as const

/** English copy. */
export const en = {
  'card.title': 'Presentation',
  'card.subtitle': 'Swiss · 16:9',
  'status.ready': 'Ready',
  'status.partial': 'HTML ready',
  'kpi.slides': 'Slides',
  'kpi.format': 'Format',
  'kpi.size': 'Size',
  'action.preview': 'Preview',
  'action.previewAria': 'Preview the HTML deck in the right sidebar',
  'action.download': 'Download PPTX',
  'action.downloadAria': 'Download the PPTX file',
  'unit.slides': '{value} slides',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',
  'unit.format': 'PPTX',
  'warnings.title': 'Export warnings',
  'note.partial': 'PPTX is not exported yet. Preview the HTML, then ask the agent to export it.',
  'note.download': 'The download is a high-fidelity image-based PPTX; it matches the HTML visually, but its text is not editable.',
  'fallback.title': 'Presentation',
  'fallback.running': 'Building…',
  'path.html': 'HTML',
  'path.pptx': 'PPTX',
} as const

/** Key union this card binds. */
export type PptViewKey = keyof typeof zh
