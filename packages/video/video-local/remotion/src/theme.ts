/**
 * Color and type tokens for the composition. They are literal here rather than
 * inherited from the harness theme because the render project is a separate npm
 * project with no access to the client's CSS variables.
 */

/** Every color the composition draws with. */
export const COLORS = {
  /** Video background, top and bottom of the gradient. */
  deep: '#071126',
  /** Video background, the middle of the gradient. */
  mid: '#12295C',
  /** Primary text. */
  ink: '#F2F6FF',
  /** Secondary text and the unspoken part of a subtitle. */
  muted: '#A9BEE4',
  /** Brand accent. */
  accent: '#5B9DFF',
  /** Accent used where a second, lighter tone reads better. */
  accentLight: '#8FC0FF',
  /** Emphasis color for a figure a scene is built around. */
  highlight: '#FFD166',
  /** Card surface behind text. */
  surface: 'rgba(255,255,255,0.08)',
  /** Subtitle backdrop. */
  subtitlePlate: 'rgba(6,14,32,0.58)',
} as const

/** System font stack; Chinese faces first so a CJK caption keeps its own metrics. */
export const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

/** Horizontal safe margin, in pixels. */
export const SAFE_X = 96

/** Distance from the bottom edge to the subtitle plate. */
export const SUBTITLE_BOTTOM = 200

/** Type sizes, in pixels. */
export const FONT = {
  /** The opening card's title. */
  title: 104,
  /** A scene's heading. */
  heading: 72,
  /** A bullet line. */
  bullet: 46,
  /** A quoted sentence. */
  quote: 66,
  /** A figure a scene is built around. */
  figure: 168,
  /** A subtitle line. */
  subtitle: 46,
} as const
