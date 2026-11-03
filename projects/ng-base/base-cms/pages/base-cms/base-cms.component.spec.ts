import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideBaseTesting } from '@lenne.tech/ng-base/testing/base-testing.providers';

import { BaseCmsComponent } from './base-cms.component';

describe('BaseCmsComponent', () => {
  let component: BaseCmsComponent;
  let fixture: ComponentFixture<BaseCmsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BaseCmsComponent],
      providers: [provideBaseTesting()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BaseCmsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
