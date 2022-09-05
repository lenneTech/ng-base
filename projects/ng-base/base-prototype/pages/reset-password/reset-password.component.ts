import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, UntypedFormGroup, Validators } from '@angular/forms';
import { FormsService, ToastService, ToastType, UserService, Validation } from '@lenne.tech/ng-base/shared';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'base-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  @Input() redirectUrl = '/';
  form: FormGroup;
  loading = false;
  token: string;
  error = '';

  constructor(
    private formsService: FormsService,
    private userService: UserService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.params?.token;

    if (!this.token) {
      this.error =
        'Der Link ist abgelaufen oder ungültig, bitte probiere es später erneut oder wende Dich an den Support.';
    }

    this.createForm();
  }

  /**
   * Create password change form
   */
  createForm() {
    this.form = new UntypedFormGroup(
      {
        password: new FormControl<string>('', [Validators.required, Validators.minLength(6)]),
        passwordConfirm: new FormControl<string>('', [Validators.required, Validators.minLength(6)]),
      },
      { validators: Validation.match('password', 'passwordConfirm') }
    );
  }

  /**
   * Submit form and change password of user
   */
  submit() {
    this.loading = true;

    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      this.loading = false;
      return;
    }

    this.userService.resetPassword(this.token, this.form.get('password').value).subscribe({
      next: (response) => {
        if (response) {
          this.form.reset();
          this.toastService.show({
            id: 'password-reset-success',
            title: 'Erfolgreich',
            description: 'Passwort wurde erfolgreich geändert.',
            type: ToastType.SUCCESS,
          });
        }

        this.router.navigate([this.redirectUrl]);
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.toastService.show({
          id: 'password-reset-error',
          title: 'Fehlgeschlagen',
          description: 'Passwort zurücksetzen ist fehlgeschlagen, bitte versuche es später erneut.',
          type: ToastType.ERROR,
        });
      },
    });
  }
}
