/** Remotion's entry point: it must call `registerRoot`, and nothing else here. */

import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root.tsx'

registerRoot(RemotionRoot)
