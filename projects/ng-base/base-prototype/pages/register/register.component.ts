import { Component, Input, OnInit } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import {
  FormsService,
  fullEmail,
  securePasswordValidator,
  UserService,
  Validation,
  RegisterConfig,
} from '@lenne.tech/ng-base/shared';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'base-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  @Input() config: RegisterConfig = {};

  form: UntypedFormGroup;
  error: string;
  loading: boolean;
  redirectUrl = '';
  subscription = new Subscription();

  constructor(
    private formsService: FormsService,
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.createForm();
    this.redirectUrl = this.config?.redirectUrl || '';
    this.subscription.add(
      this.route.queryParams.subscribe((params) => {
        this.redirectUrl = params.redirectUrl;
      })
    );
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new UntypedFormGroup(
      {
        firstName: new UntypedFormControl('', [Validators.required]),
        lastName: new UntypedFormControl('', [Validators.required]),
        email: new UntypedFormControl('', [Validators.required, fullEmail()]),
        password: new UntypedFormControl('', [Validators.required, securePasswordValidator()]),
        passwordConfirm: new UntypedFormControl('', [Validators.required, securePasswordValidator()]),
        privacy: new UntypedFormControl(false, Validators.requiredTrue),
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
    this.loading = true;

    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      this.scrollToTop();
      this.loading = false;
      return;
    }

    const input = this.form.value;
    delete input.privacy;

    this.userService.register(input).subscribe({
      next: (auth) => {
        if (auth) {
          this.router.navigate([this.redirectUrl ? this.redirectUrl : '/main']);
        } else {
          this.error = 'Etwas ist schiefgelaufen. Bitte probiere es später erneut.';
          this.scrollToTop();
        }
        this.loading = false;
      },
      error: (err) => {
        if (err?.message?.includes('already exists')) {
          this.error =
            'Mit dieser E-Mail gibt es bereits ein Konto. Bitte wähle eine andere E-Mail Adresse oder logge dich mit deinem Passwort ein.';
          this.scrollToTop();
        }

        this.loading = false;
      },
    });
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
