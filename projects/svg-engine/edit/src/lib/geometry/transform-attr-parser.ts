// Re-export from /core (single source of truth) — kept here for
// backward compatibility with any code that still imports from the
// edit-side path. The implementation moved to /core in the io/optimize
// extraction (D-026): the SVG importer (svg-engine/io) and the editor's
// bbox math both need this helper, so it had to be in a non-edit entry
// point to avoid cross-pkg cycles.
export { parseTransformAttr } from '@mosaicoo/svg-engine/core';
