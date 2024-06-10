import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, UntypedFormGroup, Validators } from '@angular/forms';
import {
  FormsService,
  securePasswordValidator,
  ToastService,
  ToastType,
  UserService,
  Validation
} from '@lenne.tech/ng-base/shared';
import { ActivatedRoute, Router } from '@angular/router';
import { InputComponent } from '@lenne.tech/ng-base/base-components';

@Component({
  selector: 'base-set-password',
  templateUrl: './set-password.component.html',
  styleUrls: ['./set-password.component.scss'],
  standalone: true,
  imports: [
    InputComponent,
    ReactiveFormsModule
  ]
})
export class SetPasswordComponent implements OnInit {
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
            id: 'set-password-success',
            title: 'Erfolgreich',
            description: 'Passwort wurde erfolgreich gesetzt. Du kannst Dich nun einloggen.',
            type: ToastType.SUCCESS,
          });
        }

        this.router.navigate([this.redirectUrl]);
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.toastService.show({
          id: 'set-password-error',
          title: 'Fehlgeschlagen',
          description: 'Passwort setzen ist fehlgeschlagen, bitte versuche es später erneut.',
          type: ToastType.ERROR,
        });
      },
    });
  }
}
