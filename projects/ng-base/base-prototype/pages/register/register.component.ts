import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormsService, UserService, Validation } from '@lenne.tech/ng-base/shared';
import { Router } from '@angular/router';

@Component({
  selector: 'base-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  form: FormGroup;
  error: string;

  constructor(private formsService: FormsService, private userService: UserService, private router: Router) {}

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new FormGroup(
      {
        firstName: new FormControl('', [Validators.required]),
        lastName: new FormControl('', [Validators.required]),
        email: new FormControl('', [Validators.required, Validators.email]),
        password: new FormControl('', Validators.required),
        passwordConfirm: new FormControl('', Validators.required),
        privacy: new FormControl(false, Validators.requiredTrue),
      },
      {
        validators: [Validation.match('password', 'passwordConfirm')],
      }
    );
  }

  /**
   * Submit login form
   */
  submit() {
    this.error = '';

    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      this.scrollToTop();
      return;
    }

    const input = this.form.value;
    delete input.privacy;

    this.userService.register(input).subscribe({
      next: (auth) => {
        if (auth) {
          this.router.navigate(['/main']);
        } else {
          this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';
          this.scrollToTop();
        }
      },
      error: (err) => {
        if (err?.message?.includes('already exists')) {
          this.error =
            'Mit dieser E-Mail gibt es bereits ein Konto. Bitte wähle eine andere E-Mail Adresse oder logge dich mit deinem Passwort ein.';
          this.scrollToTop();
        }
      },
    });
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
