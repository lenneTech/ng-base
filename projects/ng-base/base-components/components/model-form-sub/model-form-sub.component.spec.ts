import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideBaseTesting } from '@lenne.tech/ng-base/testing/base-testing.providers';

import { ModelFormSubComponent } from './model-form-sub.component';

describe('ModelFormSubComponent', () => {
  let component: ModelFormSubComponent;
  let fixture: ComponentFixture<ModelFormSubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelFormSubComponent],
      providers: [provideBaseTesting()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ModelFormSubComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('fields', {});
    fixture.componentRef.setInput('config', {});
    fixture.componentRef.setInput('form', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
