import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideBaseTesting } from '@lenne.tech/ng-base/testing/base-testing.providers';

import { FabButtonComponent } from './fab-button.component';

describe('FabButtonComponent', () => {
  let component: FabButtonComponent;
  let fixture: ComponentFixture<FabButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabButtonComponent],
      providers: [provideBaseTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FabButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
