import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormsService, UserService } from '@lenne.tech/ng-base/shared';
import { Router } from '@angular/router';

@Component({
  selector: 'base-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  form: FormGroup;
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
    this.form = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
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
