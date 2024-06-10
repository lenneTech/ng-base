import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResetPassword } from './set-password.component';

describe('SetNewPasswordComponent', () => {
  let component: ResetPassword;
  let fixture: ComponentFixture<ResetPassword>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ResetPassword],
}).compileComponents();

    fixture = TestBed.createComponent(ResetPassword);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
