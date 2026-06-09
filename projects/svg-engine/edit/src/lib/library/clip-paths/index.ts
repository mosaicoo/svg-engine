export {
  ClipPathLibraryService,
  // ActiveClipPathsService: derivação interna de <defs> (só ActiveDefsService). Interna.
  type ClipPathLibraryItem,
} from './clip-path-library.service';
export {
  BUILTIN_CLIP_PATHS,
  circleClipPath,
  ellipseClipPath,
  roundedRectClipPath,
  starClipPath,
  heartClipPath,
} from './builtin-clip-paths';
export { builtinClipPathsPlugin } from './builtin-clip-paths.plugin';
