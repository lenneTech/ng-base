import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideBaseTesting } from '@lenne.tech/ng-base/testing/base-testing.providers';

import { ModelTableComponent } from './model-table.component';

describe('ModelTableComponent', () => {
  let component: ModelTableComponent;
  let fixture: ComponentFixture<ModelTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelTableComponent],
      providers: [provideBaseTesting()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ModelTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
