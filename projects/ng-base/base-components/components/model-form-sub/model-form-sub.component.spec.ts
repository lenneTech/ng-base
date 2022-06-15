import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelFormSubComponent } from './model-form-sub.component';

describe('ModelFormSubComponent', () => {
  let component: ModelFormSubComponent;
  let fixture: ComponentFixture<ModelFormSubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ModelFormSubComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ModelFormSubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
