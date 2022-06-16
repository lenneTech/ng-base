import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RefenceInputComponent } from './refence-input.component';

describe('RefenceInputComponent', () => {
  let component: RefenceInputComponent;
  let fixture: ComponentFixture<RefenceInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RefenceInputComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RefenceInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
