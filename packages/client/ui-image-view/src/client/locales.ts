export const NS = 'image'

export const zh = {
  'card.title': '图片美化',
  'status.ready': '已生成',
  'kpi.style': '风格',
  'kpi.caption': '题注',
  'section.result': '成品',
  'section.source': '原图',
  'style.revival': '诗意重绘',
  'style.pixel': '像素世界',
  'style.zine': '旧报纸',
  'action.download': '下载图片',
  'action.source': '打开原图',
  'note.local': '当前是本地 Pillow/OpenCV 风格化版本，不是 AI 重绘；接入图像模型后可直接升级。',
  'state.empty': '没有结果内容',
} as const

export const en = {
  'card.title': 'Photo styling',
  'status.ready': 'Ready',
  'kpi.style': 'Style',
  'kpi.caption': 'Caption',
  'section.result': 'Result',
  'section.source': 'Source',
  'style.revival': 'Photo revival',
  'style.pixel': 'Pixel world',
  'style.zine': 'Zine paper',
  'action.download': 'Download image',
  'action.source': 'Open source',
  'note.local': 'This is a local Pillow/OpenCV treatment, not an AI redraw; it can be upgraded when an image model is mounted.',
  'state.empty': 'No result content',
} as const

export type ImageViewKey = keyof typeof zh
