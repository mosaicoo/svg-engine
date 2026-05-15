import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SvgEngine } from './svg-engine';

describe('SvgEngine', () => {
  let component: SvgEngine;
  let fixture: ComponentFixture<SvgEngine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgEngine],
    }).compileComponents();

    fixture = TestBed.createComponent(SvgEngine);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
