import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PANEL_ID, PanelHostService } from './panel-host.service';

describe('PanelHostService (D-098)', () => {
  function make(): PanelHostService {
    return TestBed.configureTestingModule({}).inject(PanelHostService);
  }

  it('starts with no reveal request and no active panel', () => {
    const svc = make();
    expect(svc.revealRequest()).toBeNull();
    expect(svc.activePanelId()).toBeNull();
  });

  it('reveal() publishes the requested panel id', () => {
    const svc = make();
    svc.reveal(PANEL_ID.LAYERS);
    expect(svc.revealRequest()?.panelId).toBe('layers');
  });

  it('reveal() bumps the nonce so repeated reveals of the same panel still notify', () => {
    const svc = make();
    svc.reveal(PANEL_ID.PROPERTIES);
    const first = svc.revealRequest();
    svc.reveal(PANEL_ID.PROPERTIES);
    const second = svc.revealRequest();

    expect(first?.panelId).toBe('properties');
    expect(second?.panelId).toBe('properties');
    // Same panel, but a distinct value — so a watching effect re-runs (the
    // whole point of the nonce; signals dedupe by value otherwise).
    expect(second?.nonce).toBeGreaterThan(first!.nonce);
    expect(second).not.toBe(first);
  });

  it('accepts an arbitrary string id (ids are a contract, not a closed enum)', () => {
    const svc = make();
    svc.reveal('some-custom-panel');
    expect(svc.revealRequest()?.panelId).toBe('some-custom-panel');
  });

  it('setActivePanel() drives activePanelId (and clears with null)', () => {
    const svc = make();
    svc.setActivePanel(PANEL_ID.GRADIENT);
    expect(svc.activePanelId()).toBe('gradient');
    svc.setActivePanel(null);
    expect(svc.activePanelId()).toBeNull();
  });

  it('PANEL_ID values are the stable string contract shared with shells', () => {
    expect(PANEL_ID.LAYERS).toBe('layers');
    expect(PANEL_ID.HISTORY).toBe('history');
    expect(PANEL_ID.PROPERTIES).toBe('properties');
    expect(PANEL_ID.APPEARANCE).toBe('appearance');
    expect(PANEL_ID.EXPORT).toBe('export');
    expect(PANEL_ID.GRADIENT).toBe('gradient');
  });
});
