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
    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      return;
    }

    this.userService.login(this.form.value).subscribe({
      next: (response) => {
        if (response) {
          this.router.navigate(['/main']);
          this.form.reset();
        } else {
          // this.loaderService.stop(LoadingState.ERROR);
        }
      },
      error: (error) => {
        // Wrong password
        if (error?.message?.includes('Unauthorized')) {
          // this.loaderService.error({
          //   title: 'Oops!',
          //   text: 'Dein Passwort ist leider falsch. Bitte überprüfe deine Eingabe!',
          //   duration: 5000,
          // });
          // return;
        }

        // User not found
        if (error?.message?.includes('Not Found')) {
          // this.loaderService.error({
          //   title: 'Oops!',
          //   text: 'Es konnte kein Konto mit der E-Mail gefunden werden. Bitte gib eine gültige E-Mail ein!',
          //   duration: 5000,
          // });
          // return;
        }

        // this.loaderService.error();
      },
    });
  }
}
