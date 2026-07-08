// standard-version custom updater (D-031 follow-up).
//
// Keeps `SVG_ENGINE_VERSION` in `projects/svg-engine/src/public-api.ts` in
// lockstep with the bumped `projects/svg-engine/package.json` version — as
// PART of the `chore(release)` commit, so no manual edit and no postbump
// git-add dance. Referenced from `.versionrc.json` → `bumpFiles`.
//
// The `check-version-lockstep.mjs` guard stays as a CI safety net (catches
// drift if this updater ever breaks or someone edits the constant by hand).
//
// CommonJS (`.cjs`): standard-version `require()`s updaters, so it must not
// be an ES module regardless of the repo's `package.json` "type".

const RE = /(SVG_ENGINE_VERSION\s*=\s*['"])([^'"]+)(['"])/;

module.exports.readVersion = function readVersion(contents) {
  const m = contents.match(RE);
  return m ? m[2] : undefined;
};

module.exports.writeVersion = function writeVersion(contents, version) {
  return contents.replace(RE, `$1${version}$3`);
};
