import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormsService, UserService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
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
      password: new FormControl('', Validators.required),
    });
  }

  /**
   * Submit login form
   */
  submit() {
    this.error = '';
    this.loading = true;

    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      this.scrollToTop();
      this.loading = false;
      return;
    }

    this.userService.login(this.form.value).subscribe({
      next: (response) => {
        if (response) {
          this.router.navigate(['/main']);
          this.form.reset();
        } else {
          this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';
          this.scrollToTop();
        }
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';

        // Wrong password
        if (error?.message?.includes('Unauthorized')) {
          this.error = 'Dein Passwort ist leider falsch. Bitte überprüfe deine Eingabe!';
        }

        // User not found
        if (error?.message?.includes('Not user found')) {
          this.error = 'Es konnte kein Konto mit der E-Mail gefunden werden. Bitte gib eine gültige E-Mail ein!';
        }

        this.scrollToTop();
        this.loading = false;
      },
    });
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
