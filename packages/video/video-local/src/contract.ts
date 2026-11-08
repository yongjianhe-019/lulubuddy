/**
 * Protocol constants shared by the video-production provider, its tools, its
 * playback route, and the Remotion render project shipped beside them.
 *
 * These are not deployment choices. The composition id and the project layout
 * are the agreement between this host half and the render project it drives, so
 * a deployment that replaces the template must keep them; everything a
 * deployment may legitimately vary is a validated {@link Config} field instead.
 *
 * @module @deepseek-ai/dsh-video-local/contract
 */

/** Composition id the shipped render project registers and every render selects. */
export const VIDEO_COMPOSITION_ID = 'ShortVideo'

/** Payload revision the client narrows against; an unknown value draws nothing. */
export const VIDEO_PAYLOAD_VERSION = 1

/** HTTP path prefix the playback route serves under. */
export const VIDEO_ROUTE_PREFIX = '/video'

/** Marker file proving a directory holds the render project this plugin drives. */
export const PROJECT_MARKER = 'render.mjs'

/** Directory inside the render project holding narration audio and subtitle files. */
export const PROJECT_CACHE_DIR = 'public/narration'

/**
 * Prefix a scene's audio path carries in the props document.
 *
 * It is relative to the composition's public directory, which is what the
 * template's `staticFile()` resolves against; that function refuses a path
 * already carrying the `public/` the on-disk location needs, so the two are
 * separate constants rather than one path used twice.
 */
export const PROJECT_AUDIO_DIR = 'narration'

/** Directory inside the render project holding rendered videos. */
export const PROJECT_OUTPUT_DIR = 'out'

/** Directory inside the render project holding the props document one invocation writes. */
export const PROJECT_WORK_DIR = '.work'

/** Name of the props document one render invocation writes into the work directory. */
export const PROJECT_PROPS_FILE = 'props.json'

/** Directory inside the render project holding the virtual environment the plugin owns. */
export const PROJECT_VENV_DIR = '.venv'

/** File inside the render project recording which shipped template was last laid down. */
export const PROJECT_TEMPLATE_MARKER = '.dsh-video-template'

/**
 * File inside the render project recording which dependency set its installed
 * packages satisfy.
 *
 * The decision to install is this digest rather than the presence of a package
 * directory: a template upgrade that adds a dependency must reconcile the
 * project, and a directory that merely happens to exist says nothing about
 * whether it carries the version the template now asks for.
 */
export const PROJECT_INSTALL_MARKER = '.dsh-video-install'

/** Render driver shipped inside the project; the provider spawns it to bundle and render. */
export const PROJECT_DRIVER = 'render.mjs'

/** edge-tts voice the create tool uses when the caller names none. */
export const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

/** Default scene layout when a scene names none. */
export const DEFAULT_LAYOUT = 'points'

/**
 * Silence the composition holds after a scene's narration ends, in milliseconds.
 * It separates consecutive scenes so a listener hears the break between them.
 */
export const SCENE_TAIL_MS = 600

/** Longest narration one scene may carry, in characters. */
export const MAX_NARRATION_CHARS = 400

/** Most scenes one video may contain. */
export const MAX_SCENES = 24

/** Most bullets one scene may carry. */
export const MAX_BULLETS = 6

/** Longest heading or bullet, in characters. */
export const MAX_LINE_CHARS = 40
