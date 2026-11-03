import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideBaseTesting } from '@lenne.tech/ng-base/testing/base-testing.providers';

import { RefenceInputComponent } from './refence-input.component';

describe('RefenceInputComponent', () => {
  let component: RefenceInputComponent;
  let fixture: ComponentFixture<RefenceInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefenceInputComponent],
      providers: [provideBaseTesting()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RefenceInputComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('control', new FormControl(''));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
