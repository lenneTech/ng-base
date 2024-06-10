import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, UntypedFormGroup, Validators } from '@angular/forms';
import {
  AuthService,
  FormsService,
  securePasswordValidator,
  ToastService,
  ToastType,
  UserService,
  Validation,
} from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss'],
})
export class ChangePasswordComponent implements OnInit {
  form: FormGroup;
  loading = false;

  constructor(
    private formsService: FormsService,
    private userService: UserService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Create password change form
   */
  createForm() {
    this.form = new UntypedFormGroup(
      {
        current: new FormControl<string>('', [Validators.required]),
        password: new FormControl<string>('', [Validators.required, securePasswordValidator()]),
        passwordConfirm: new FormControl<string>('', [Validators.required, securePasswordValidator()]),
      },
      Validation.match('password', 'passwordConfirm') as any
    );
  }

  /**
   * Submit form and change password of user
   */
  submit() {
    this.loading = true;
    this.userService
      .login({
        email: this.authService.currentUser.email,
        password: this.form.get('current').value,
      })
      .subscribe({
        next: () => {
          if (this.form.invalid) {
            this.formsService.validateAllFormFields(this.form);
            this.loading = false;
            return;
          }

          this.userService.changePassword(this.authService.currentUser.id, this.form.get('password').value).subscribe({
            next: (response) => {
              if (response) {
                this.form.reset();
                this.toastService.show({
                  id: 'password-change-success',
                  title: 'Erfolgreich',
                  description: 'Passwort wurde erfolgreich geändert.',
                  type: ToastType.SUCCESS,
                });
              }

              this.loading = false;
            },
            error: () => {
              this.loading = false;
              this.toastService.show({
                id: 'password-change-error',
                title: 'Fehlgeschlagen',
                description: 'Passwort ändern ist fehlgeschlagen, bitte versuche es später erneut.',
                type: ToastType.ERROR,
              });
            },
          });
        },
        error: () => {
          this.loading = false;
          this.toastService.show({
            id: 'password-change-error',
            title: 'Fehlgeschlagen',
            description: 'Passwort ändern ist fehlgeschlagen. Falsches Passwort.',
            type: ToastType.ERROR,
            errorCode: '401',
          });
        },
      });
  }
}
