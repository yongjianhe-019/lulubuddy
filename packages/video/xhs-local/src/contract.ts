/**
 * Protocol constants shared by the Xiaohongshu packaging provider, its tool, and
 * the Web card that draws the finished post.
 *
 * These are not deployment choices: the payload revision, the operations-file
 * markers, and the card's document keys are the agreement between the host half,
 * the model-facing tool, and the browser card. Every path a deployment may vary
 * is a validated {@link Config} field instead.
 *
 * @module @deepseek-ai/dsh-xhs-local/contract
 */

/** Payload revision the client narrows against; an unknown value draws nothing. */
export const XHS_PAYLOAD_VERSION = 1

/** Default HTTP path prefix the finished-video route serves under. */
export const XHS_ROUTE_PREFIX = '/xhs-assets'

/** Marker in the operating manual where a new index row is inserted. */
export const INDEX_MARKER = '<!-- xhs-index-insert -->'

/** Marker in the operating manual where a new recent-progress bullet is inserted. */
export const RECENT_MARKER = '<!-- xhs-recent-insert -->'

/** Marker at the end of the append-only operations log. */
export const LOG_MARKER = '<!-- xhs-log-insert -->'

/** Marker at the end of the post-library table. */
export const LIBRARY_MARKER = '<!-- xhs-library-insert -->'

/** Longest post title, in Unicode code points. */
export const MAX_TITLE_CHARS = 20

/** Longest post body, in characters. */
export const MAX_BODY_CHARS = 1000

/** Fewest and most hashtags one post may carry. */
export const MIN_TAGS = 3
export const MAX_TAGS = 8

/** Most `不是 ... 是 ...` constructions the publishing brief allows. */
export const MAX_CONTRAST_PATTERNS = 2
