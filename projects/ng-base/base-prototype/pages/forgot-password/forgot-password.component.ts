import { Component, OnInit } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { FormsService, UserService, fullEmail } from '@lenne.tech/ng-base/shared';
import { Router } from '@angular/router';

@Component({
  selector: 'base-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  form: UntypedFormGroup;
  error: string;
  loading: boolean;

  constructor(private formsService: FormsService, private userService: UserService, private router: Router) {}

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new UntypedFormGroup({
      email: new UntypedFormControl('', [Validators.required, fullEmail()]),
    });
  }

  /**
   * Submit form
   */
  submit() {
    this.loading = true;

    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      this.loading = false;
      return;
    }

    this.userService.requestPasswordResetMail(this.form.get('email').value).subscribe({
      next: (response) => {
        if (response) {
          this.router.navigate(['/']);
        } else {
          this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';
        this.loading = false;
      },
    });
  }
}
