import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { SvgePluginManagerDialog } from './plugin-manager-dialog.component';
import { SvgePluginManagerDialogService } from './plugin-manager-dialog.service';

describe('SvgePluginManagerDialogService', () => {
  it('opens the plugin manager dialog component via MatDialog', () => {
    const open = vi.fn().mockReturnValue({ afterClosed: () => ({}) });
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: { open } }],
    });
    const svc = TestBed.inject(SvgePluginManagerDialogService);
    svc.open();
    expect(open).toHaveBeenCalledTimes(1);
    // First arg is the dialog component; second is the svgeDialogConfig.
    expect(open.mock.calls[0]?.[0]).toBe(SvgePluginManagerDialog);
  });
});
