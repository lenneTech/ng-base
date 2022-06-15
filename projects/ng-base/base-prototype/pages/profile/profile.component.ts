import { Component, Input } from '@angular/core';
import { AuthService, BasicUser } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  @Input() config: any = {};
  profileConfig = {
    email: {
      label: 'E-Mail',
      placeholder: '',
    },
    firstName: {
      label: 'Vorname',
      placeholder: '',
    },
    lastName: {
      label: 'Nachname',
      placeholder: '',
    },
    roles: {
      exclude: true,
    },
    username: {
      label: 'Benutzername',
      placeholder: '',
    },
    password: {
      exclude: true,
    },
  };

  currentUser: BasicUser;

  constructor(private authService: AuthService) {
    this.currentUser = authService.currentUser;
    this.profileConfig = { ...this.profileConfig, ...this.config };
  }
}
