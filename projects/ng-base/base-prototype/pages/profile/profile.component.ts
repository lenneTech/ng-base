import { Component, Input, OnInit } from '@angular/core';
import { AuthService, BasicUser, UserService } from '@lenne.tech/ng-base/shared';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'base-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  @Input() config: any = {};
  profileConfig = {
    avatar: {
      label: 'E-Mail',
      placeholder: '',
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
      exclude: true,
      roles: ['admin'],
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

  constructor(private authService: AuthService, private route: ActivatedRoute, private userService: UserService) {
    this.currentUser = authService.currentUser;
    this.profileConfig = { ...this.profileConfig, ...this.config };
  }

  ngOnInit() {
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
    this.userService.get(this.authService.currentUser.id).subscribe((user) => {
      if (user) {
        this.authService.currentUser = user;
      }
    });
  }
}
