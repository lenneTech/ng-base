import { Component, Inject, OnInit } from '@angular/core';
import { AuthService, BasicUser, GraphqlCrudType, GraphQLMeta, GraphQLMetaService } from '@lenne.tech/ng-base/shared';
import { ActivatedRoute, Router } from '@angular/router';
import { BASE_CMS_MODULE_CONFIG, BaseCMSModuleConfig } from '../../interfaces/base-cms-module-config.interface';

@Component({
  selector: 'app-base-cms',
  templateUrl: './base-cms.component.html',
  styleUrls: ['./base-cms.component.scss'],
})
export class BaseCmsComponent implements OnInit {
  meta: GraphQLMeta;
  modelName: string;
  id: string;
  types: GraphqlCrudType[] = [];

  constructor(
    @Inject(BASE_CMS_MODULE_CONFIG) public moduleConfig: BaseCMSModuleConfig,
    private graphQLMetaService: GraphQLMetaService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {
    this.route.params.subscribe((value) => {
      if (value['modelName']) {
        if (!this.checkModelIsExcludedOrRestrcited(value['modelName'])) {
          this.modelName = value['modelName'];
        } else {
          this.init().then((types: GraphqlCrudType[]) => {
            this.router.navigate(['../' + types[0].name.toLowerCase()], { relativeTo: this.route });
          });
        }
      }

      if (value['id']) {
        this.id = value['id'];
      }
    });
  }

  async ngOnInit() {
    await this.init();
  }

  /**
   * It returns a promise that resolves to an array of GraphqlCrudType objects
   *
   * @returns The types that are available to the user.
   */
  init(): Promise<GraphqlCrudType[]> {
    return new Promise((resolve, reject) => {
      this.graphQLMetaService.getMeta().subscribe((meta) => {
        this.meta = meta;

        if (this.route.snapshot?.params?.['modelName']) {
          this.modelName = this.route.snapshot?.params?.['modelName'];
        }

        if (this.route.snapshot?.params?.['id']) {
          this.id = this.route.snapshot?.params?.['id'];
        }

        const excludedModels = this.moduleConfig.excludedModels?.map((e) => e.toLowerCase());
        const types = meta.getTypes();

        // Check for excluded types
        const filteredTypes = types.filter((e) => !excludedModels?.includes(e.name.toLowerCase()));

        // Check for restricted types
        this.types = filteredTypes.filter((e) => {
          const foundRestrict = this.moduleConfig.restrictedModels?.find(
            (v) => v.model.toLowerCase() === e.name.toLowerCase()
          );

          if (foundRestrict) {
            if (!this.authService?.currentUser) {
              return false;
            }
            const user = this.authService?.currentUser;
            const mappedUser = BasicUser.map(user);

            return mappedUser?.hasAllRoles(foundRestrict.roles);
          } else {
            return true;
          }
        });

        if (this.moduleConfig?.logging) {
          console.log('BaseCmsComponent::init->types', this.types);
        }

        resolve(this.types);

        if (!this.modelName && this.types) {
          this.router.navigate(['./' + this.types[0].name.toLowerCase()], { relativeTo: this.route });
        }
      });
    });
  }

  /**
   * It checks if the model is excluded or restricted
   *
   * @param model - The name of the model you want to check.
   * @returns A boolean value.
   */
  checkModelIsExcludedOrRestrcited(model: string): boolean {
    if (!model) {
      return false;
    }
    const excludedModels = this.moduleConfig.excludedModels?.map((e) => e.toLowerCase());
    return !!(
      excludedModels?.includes(model?.toLowerCase()) ||
      this.moduleConfig.restrictedModels?.find((e) => e.model.toLowerCase() === model.toLowerCase())
    );
  }

  /**
   * If the model name is set and the types are set, then return the type that matches the model name
   *
   * @returns The type object that matches the model name.
   */
  getTypeByModelName() {
    if (this.modelName && this.types) {
      return this.types.find((e) => e.name.toLowerCase() === this.modelName.toLowerCase());
    } else {
      return null;
    }
  }

  /**
   * When the createModeChanged event is emitted, if the createMode is true, navigate to the new route
   *
   * @param createMode - boolean - This is a boolean value that indicates whether the user is in create mode or
   * not.
   */
  onCreateModeChanged(createMode: boolean) {
    if (createMode) {
      this.router.navigate(['./' + 'new'], { relativeTo: this.route });
    }
  }

  /**
   * If the type exists, return the create property of the type, otherwise return false.
   *
   * @returns A boolean value.
   */
  isCreatePossible(): boolean {
    const type = this.getTypeByModelName();
    return type ? type.create : false;
  }

  /**
   * If the model name is found in the type map, return the update property of the type object
   *
   * @returns A boolean value.
   */
  isUpdatePossible(): boolean {
    const type = this.getTypeByModelName();
    return type ? type.update : false;
  }

  /**
   * If the type is defined, return the delete property of the type, otherwise return false
   *
   * @returns A boolean value.
   */
  isDeletePossible(): boolean {
    const type = this.getTypeByModelName();
    return type ? type.delete : false;
  }

  /**
   * If the id is truthy, navigate to the id, otherwise navigate to the parent route
   *
   * @param id - The id of the selected item.
   */
  idSelected(id: string) {
    if (id) {
      this.router.navigate(['./' + id], { relativeTo: this.route });
    } else {
      this.router.navigate(['..'], { relativeTo: this.route });
    }
  }
}
