/**
 * `video` namespace dictionaries.
 *
 * Every label a card draws comes from here, including the unit formatters, so a
 * deployment that translates the product translates the whole card. The Chinese
 * side is the key-set source of truth and the English side is checked against
 * it.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'card.create': '短视频',
  'card.setup': '渲染环境',

  'state.running': '正在渲染视频，请稍候……',
  'state.setup': '正在准备渲染环境：安装渲染依赖、下载渲染浏览器、配置配音。首次需要几分钟，之后每次调用只需数秒。',
  'state.empty': '这一次调用没有返回结果。',
  'warnings.title': '制作提示',

  'kpi.duration': '时长',
  'kpi.size': '文件大小',
  'kpi.frame': '画面',
  'kpi.voice': '音色',
  'kpi.scenes': '分镜',
  'kpi.project': '渲染工程',
  'kpi.remotion': 'Remotion',
  'kpi.edgeTts': 'edge-tts',

  'unit.frame': '{width}×{height} · {fps}fps',
  'unit.seconds': '{value} 秒',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',
  'unit.scenes': '{value} 段',

  'media.label': '成片预览',
  'media.unavailable': '本次部署未挂载播放路由，请直接打开下面这个文件。',
  'media.unsupported': '这个浏览器无法播放该文件，请直接打开下面这个文件。',

  'output.label': '文件',
  'storyboard.title': '分镜与时长',
  'scene.label': '第 {index} 段',
  'scene.cached': '复用已有配音',
  'scene.range': '{start} → {end}',

  'setup.ready': '已就绪',
  'setup.project': '工程目录',
  'setup.laid': '模板',
  'setup.packages': '渲染依赖',
  'setup.browser': '渲染浏览器',
  'setup.laid.yes': '本次已写入',
  'setup.laid.no': '已是最新',
  'setup.installed': '本次已安装',
  'setup.present': '已存在',
} satisfies Record<string, string>

/** Video card dictionary key union. */
export type VideoViewKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'card.create': 'Short video',
  'card.setup': 'Render environment',

  'state.running': 'Rendering the video — this takes a moment…',
  'state.setup': 'Preparing the render environment: installing render packages, downloading the render browser, and setting up narration. The first call takes minutes; later calls take seconds.',
  'state.empty': 'This call returned no result.',
  'warnings.title': 'Production notes',

  'kpi.duration': 'Duration',
  'kpi.size': 'File size',
  'kpi.frame': 'Frame',
  'kpi.voice': 'Voice',
  'kpi.scenes': 'Scenes',
  'kpi.project': 'Render project',
  'kpi.remotion': 'Remotion',
  'kpi.edgeTts': 'edge-tts',

  'unit.frame': '{width}×{height} · {fps}fps',
  'unit.seconds': '{value} s',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',
  'unit.scenes': '{value}',

  'media.label': 'Rendered video',
  'media.unavailable': 'This deployment mounted no playback route; open the file below instead.',
  'media.unsupported': 'This browser cannot play the file; open it below instead.',

  'output.label': 'File',
  'storyboard.title': 'Scenes and timing',
  'scene.label': 'Scene {index}',
  'scene.cached': 'Reused narration',
  'scene.range': '{start} → {end}',

  'setup.ready': 'Ready',
  'setup.project': 'Project directory',
  'setup.laid': 'Template',
  'setup.packages': 'Render packages',
  'setup.browser': 'Render browser',
  'setup.laid.yes': 'Written now',
  'setup.laid.no': 'Already current',
  'setup.installed': 'Installed now',
  'setup.present': 'Already present',
} satisfies Record<VideoViewKey, string>

/** Locale namespace the video cards register their dictionaries under. */
export const NS = 'video'
