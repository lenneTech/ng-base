import { Component, Input } from '@angular/core';
import { AuthService, ToastService, ToastType, UserService } from '@lenne.tech/ng-base/shared';
import { Router } from '@angular/router';

@Component({
  selector: 'base-delete-account',
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.scss'],
  standalone: true,
})
export class DeleteAccountComponent {
  @Input() description =
    'Mit dem Löschen Deines Kontos werden alle persönlichen Daten sofort gelöscht und sind nicht wiederherstellbar.';
  loading = false;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {}

  deleteAccount() {
    this.loading = true;

    if (!confirm('Willst Du wirklich ein Konto unwiderruflich löschen?')) {
      this.loading = false;
      return;
    }

    this.userService.delete(this.authService.currentUser.id).subscribe({
      next: (response) => {
        if (response) {
          this.toastService.show({
            id: 'delete-user-success',
            title: 'Erfolgreich',
            description: 'Dein Konto wurde erfolgreich gelöscht.',
            type: ToastType.SUCCESS,
          });
        }
        this.authService.logout();
        this.router.navigate(['/']);

        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.toastService.show({
          id: 'delete-user-error',
          title: 'Fehlgeschlagen',
          description: 'Konto löschen ist fehlgeschlagen, bitte versuche es später erneut.',
          type: ToastType.ERROR,
        });
      },
    });
  }
}
