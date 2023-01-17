import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsService, fullEmail, LoginConfig, UserService } from '@lenne.tech/ng-base/shared';
import { Subscription } from 'rxjs';

@Component({
  selector: 'base-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  @Input() config: LoginConfig = {};

  form: UntypedFormGroup;
  error: string;
  loading: boolean;
  subscription = new Subscription();
  loginConfig: LoginConfig = {
    redirectUrl: '/main',
    showPasswordForget: true,
    showRegister: true,
    logoUrl: '',
  };
  redirectUrl: '';

  constructor(
    private formsService: FormsService,
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loginConfig = { ...this.loginConfig, ...this.config };

    this.createForm();

    this.subscription.add(
      this.route.data.subscribe((data) => {
        // Merge config from route to component
        if (data?.config) {
          this.loginConfig = { ...this.loginConfig, ...data.config };
        }
      })
    );

    this.subscription.add(
      this.route.queryParams.subscribe((params) => {
        this.redirectUrl = params.redirectUrl;
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new UntypedFormGroup({
      email: new UntypedFormControl('', [Validators.required, fullEmail()]),
      password: new UntypedFormControl('', Validators.required),
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
          this.router.navigate([this.redirectUrl ? this.redirectUrl : this.loginConfig.redirectUrl]);
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
        if (error?.message?.includes('No user found')) {
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
