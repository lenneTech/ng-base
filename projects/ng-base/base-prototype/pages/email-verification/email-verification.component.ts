import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService, ToastType, UserService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-email-verification',
  templateUrl: './email-verification.component.html',
  styleUrls: ['./email-verification.component.scss'],
})
export class EmailVerificationComponent implements OnInit {
  token: string;
  mode: 'ERROR' | 'SUCCESS';
  loading = false;

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.params?.token;

    if (!this.token) {
      this.mode = 'ERROR';
      return;
    }

    this.verifyUser();
  }

  verifyUser() {
    this.userService.verifyUser(this.token).subscribe({
      next: (response) => {
        if (response) {
          this.toastService.show({
            id: 'email-verification-success',
            title: 'Erfolgreich',
            description: 'Du hast deine E-Mail erfolgreich verifiziert.',
            type: ToastType.SUCCESS,
          });

          this.mode = 'SUCCESS';

          setTimeout(() => {
            this.router.navigate(['/']);
          }, 3000);
        } else {
          this.mode = 'ERROR';
        }

        this.loading = false;
      },
      error: () => {
        this.mode = 'ERROR';
      },
    });
  }
}
