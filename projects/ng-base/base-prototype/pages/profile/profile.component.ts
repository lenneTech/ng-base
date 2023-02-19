import { Component, Input, OnInit } from '@angular/core';
import { AuthService, BasicUser, CMSFieldConfig, UserService } from '@lenne.tech/ng-base/shared';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'base-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  @Input() config: { [key: string]: CMSFieldConfig } = {};
  profileConfig: { [key: string]: CMSFieldConfig } = {
    avatar: {
      label: 'Profilbild',
      placeholder: '',
      croppingImage: true,
      croppingOptions: {
        aspectRatio: 1 / 1,
        format: 'png',
      },
    },
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
      label: '',
      exclude: true,
      roles: ['admin'],
    },
    username: {
      label: 'Benutzername',
      placeholder: '',
    },
    password: {
      label: '',
      exclude: true,
    },
  };

  currentUser: BasicUser;

  constructor(private authService: AuthService, private route: ActivatedRoute, private userService: UserService) {
    this.currentUser = authService.currentUser;
  }

  ngOnInit() {
    this.profileConfig = { ...this.profileConfig, ...this.config };
    this.route.data.subscribe((data) => {
      // Merge config from route to component
      if (data) {
        this.profileConfig = { ...this.profileConfig, ...data };
      }
    });
  }

  /**
   * It gets the current user from the database and updates the current user in the session
   */
  updateSessionUser() {
    if (!this.authService.currentUser) {
      return;
    }

    this.userService.get(this.authService.currentUser.id).subscribe((user) => {
      if (user) {
        this.authService.currentUser = user;
      }
    });
  }
}
