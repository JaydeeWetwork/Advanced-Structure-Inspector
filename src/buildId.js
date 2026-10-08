/**
 * Product version shown in the header as major.minor.build.
 * Jaydee chooses when VERSION_MAJOR or VERSION_MINOR moves.
 * VERSION_BUILD is the old build counter. Move it on a user-facing drop.
 * HTML `?v=` and package.json "version" must use BUILD_ID.
 * The header shows BUILD_ID with no "build" word.
 */
export const VERSION_MAJOR = 0;
export const VERSION_MINOR = 1;
export const VERSION_BUILD = 157;

export const BUILD_ID = `${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_BUILD}`;
