import {
  parseWorkspace,
  serializeWorkspace,
  WORKSPACE_FORMAT,
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceEditorState,
} from './workspace-file';

/** **D-138** — pure codec for the `.svge` workspace envelope. */
describe('D-138 — workspace-file codec', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';

  const FULL_EDITOR: WorkspaceEditorState = {
    activePageIndex: 2,
    viewport: {
      zoom: 1.5,
      panX: 10,
      panY: -20,
      contentBox: { x: 0, y: 0, width: 800, height: 600 },
    },
    workspace: {
      background: { kind: 'solid', color: '#222' },
      page: {
        width: 800,
        height: 600,
        orientation: 'landscape',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      grid: { enabled: true, spacing: 20, majorEvery: 5, color: '#90a4ae' },
      rulers: { enabled: true },
      guides: [
        { id: 'guide-1', axis: 'h', position: 100 },
        { id: 'guide-2', axis: 'v', position: 250 },
      ],
      guidesLocked: true,
      interaction: { wheelZoomSpeed: 7 },
    },
  };

  it('round-trips document + full editor state', () => {
    const text = serializeWorkspace(SVG, FULL_EDITOR);
    const parsed = parseWorkspace(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).toBe(SVG);
    expect(parsed.editor).toEqual(FULL_EDITOR);
  });

  it('emits a valid JSON envelope with format + schemaVersion', () => {
    const obj = JSON.parse(serializeWorkspace(SVG, { activePageIndex: null })) as Record<
      string,
      unknown
    >;
    expect(obj['format']).toBe(WORKSPACE_FORMAT);
    expect(obj['schemaVersion']).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(obj['document']).toBe(SVG);
    expect(obj['app']).toBe('SVGEngine');
  });

  it('rejects invalid JSON', () => {
    const parsed = parseWorkspace('{ not json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('invalid JSON');
  });

  it('rejects a non-workspace JSON object', () => {
    const parsed = parseWorkspace(JSON.stringify({ format: 'something-else', document: SVG }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('SVGEngine workspace');
  });

  it('rejects a future schema version', () => {
    const parsed = parseWorkspace(
      JSON.stringify({
        format: WORKSPACE_FORMAT,
        schemaVersion: WORKSPACE_SCHEMA_VERSION + 1,
        document: SVG,
        editor: { activePageIndex: null },
      }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('Unsupported workspace version');
  });

  it('rejects an empty/missing document payload', () => {
    const parsed = parseWorkspace(
      JSON.stringify({ format: WORKSPACE_FORMAT, schemaVersion: 1, document: '', editor: {} }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('no document payload');
  });

  it('drops an invalid viewport but still opens the document', () => {
    const parsed = parseWorkspace(
      JSON.stringify({
        format: WORKSPACE_FORMAT,
        schemaVersion: 1,
        document: SVG,
        editor: { activePageIndex: 0, viewport: { zoom: 'nope', panX: 0, panY: 0 } },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.editor.activePageIndex).toBe(0);
    expect(parsed.editor.viewport).toBeUndefined();
  });

  it('drops malformed guides and synthesizes a missing id', () => {
    const parsed = parseWorkspace(
      JSON.stringify({
        format: WORKSPACE_FORMAT,
        schemaVersion: 1,
        document: SVG,
        editor: {
          activePageIndex: null,
          workspace: {
            guides: [
              { axis: 'h', position: 50 }, // no id → synthesized
              { axis: 'x', position: 10 }, // bad axis → dropped
              { axis: 'v', position: 'NaN' }, // bad position → dropped
            ],
          },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const guides = parsed.editor.workspace?.guides ?? [];
    expect(guides.length).toBe(1);
    expect(guides[0]).toEqual({ id: 'guide-1', axis: 'h', position: 50 });
  });

  it('coerces a negative/non-integer activePageIndex to null', () => {
    const parse = (idx: unknown): number | null => {
      const r = parseWorkspace(
        JSON.stringify({
          format: WORKSPACE_FORMAT,
          schemaVersion: 1,
          document: SVG,
          editor: { activePageIndex: idx },
        }),
      );
      return r.ok ? r.editor.activePageIndex : NaN;
    };
    expect(parse(-1)).toBeNull();
    expect(parse(1.5)).toBeNull();
    expect(parse(3)).toBe(3);
  });
});
