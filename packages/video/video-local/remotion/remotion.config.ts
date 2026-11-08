import { Config } from '@remotion/cli/config'

// Frame images are JPEG: this composition draws no transparency, and JPEG keeps
// an intermediate frame small enough to encode a 1080x1920 video in one pass.
Config.setVideoImageFormat('jpeg')

// A render always writes the path the harness names, which a retry reuses.
Config.setOverwriteOutput(true)
