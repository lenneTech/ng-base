import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import {
  AuthService,
  BasicUser,
  CmsService,
  GraphqlCrudType,
  GraphQLMeta,
  GraphQLMetaService
} from '@lenne.tech/ng-base/shared';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BASE_CMS_MODULE_CONFIG, BaseCMSModuleConfig } from '../../interfaces/base-cms-module-config.interface';
import { Subscription } from 'rxjs';
import { NgClass, NgStyle } from '@angular/common';
import { ModelTableComponent } from '@lenne.tech/ng-base/base-components';

@Component({
  selector: 'app-base-cms',
  templateUrl: './base-cms.component.html',
  styleUrls: ['./base-cms.component.scss'],
  standalone: true,
  imports: [
    NgStyle,
    RouterLink,
    NgClass,
    ModelTableComponent
  ]
})
export class BaseCmsComponent implements OnInit, OnDestroy {
  meta: GraphQLMeta;
  modelName: string;
  camelModelName: string;
  id: string;
  types: GraphqlCrudType[] = [];
  subscription = new Subscription();
  sideBarWidth = '22%';
  responsiveToggle = false;

  constructor(
    @Inject(BASE_CMS_MODULE_CONFIG) public moduleConfig: BaseCMSModuleConfig,
    private graphQLMetaService: GraphQLMetaService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private cmsService: CmsService
  ) {
    this.calcSideBarWidth();
    this.subscription.add(
      this.route.params.subscribe((value) => {
        if (value['modelName']) {
          const exclude = this.moduleConfig.modelConfig[value['modelName']]?.exclude;

          if (exclude !== null && !exclude) {
            this.modelName = value['modelName'];
            this.camelModelName = this.toCamelCase(this.modelName);
          } else {
            this.init().then((types: GraphqlCrudType[]) => {
              this.router.navigate(['../' + this.toKebabCase(types[0].name)], { relativeTo: this.route });
            });
          }
        }

        if (value['id']) {
          this.id = value['id'];
        }
      })
    );
  }

  async ngOnInit() {
    await this.init();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
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
          this.camelModelName = this.toCamelCase(this.modelName);
        }

        if (this.route.snapshot?.params?.['id']) {
          this.id = this.route.snapshot?.params?.['id'];
        }

        const types = meta.getTypes(this.moduleConfig?.logging);

        // Check for excluded types
        let filteredTypes = types.filter((e) => !this.moduleConfig?.modelConfig[e.name.toLowerCase()]?.exclude);

        // Sort types
        filteredTypes = filteredTypes.sort((a, b) => {
          return (
            (this.moduleConfig?.modelConfig[a.name.toLowerCase()]?.order
              ? this.moduleConfig?.modelConfig[a.name.toLowerCase()]?.order
              : 99) -
            (this.moduleConfig?.modelConfig[b.name.toLowerCase()]?.order
              ? this.moduleConfig?.modelConfig[b.name.toLowerCase()]?.order
              : 99)
          );
        });

        // Check for restricted types
        this.types = filteredTypes.filter((e) => {
          if (this.moduleConfig?.modelConfig[e.name.toLowerCase()]?.restricted) {
            if (!this.authService?.currentUser) {
              return false;
            }
            const user = this.authService?.currentUser;
            const mappedUser = BasicUser.map(user);

            return mappedUser?.hasAllRoles(this.moduleConfig?.modelConfig[e.name.toLowerCase()]?.roles);
          } else {
            return true;
          }
        });

        if (this.moduleConfig?.logging) {
          console.log('BaseCmsComponent::init->types', this.types);
          console.log('BaseCmsComponent::init->camelModelName', this.camelModelName);
          console.log('BaseCmsComponent::init->fieldConfig', this.moduleConfig?.fieldConfig);
        }

        resolve(this.types);

        if (!this.modelName && this.types) {
          this.router.navigate(['./' + this.toKebabCase(this.types[0].name)], { relativeTo: this.route });
        }
      });
    });
  }

  /**
   * If the model name is set and the types are set, then return the type that matches the model name
   *
   * @returns The type object that matches the model name.
   */
  getTypeByModelName() {
    if (this.modelName && this.types) {
      return this.types.find((e) => this.toKebabCase(e.name) === this.toKebabCase(this.modelName));
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
      this.router.navigate(['./' + 'neu'], { relativeTo: this.route });
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

  isImportPossible(): boolean {
    let result = false;
    const config = this.moduleConfig?.modelConfig[this.camelModelName]?.import;

    if (config !== null && config !== undefined) {
      result = config;
    }

    return result;
  }

  isExportPossible(): boolean {
    let result = false;
    const config = this.moduleConfig?.modelConfig[this.camelModelName]?.export;

    if (config !== null && config !== undefined) {
      result = config;
    }

    return result;
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
   * If the model name is found in the type array, return the duplicate property of the type object
   *
   * @returns A boolean value.
   */
  isDuplicatePossible(): boolean {
    const type = this.getTypeByModelName();
    return type ? type.duplicate : false;
  }

  /**
   * If the id is truthy, navigate to the id, otherwise navigate to the parent route
   */
  idSelected(id: string) {
    if (id) {
      this.router.navigate(['./' + id], { relativeTo: this.route });
    } else {
      this.router.navigate(['..'], { relativeTo: this.route });
    }
  }

  /**
   * Transform string to kebab case
   */
  toKebabCase(str: string) {
    return str?.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Transform string to camel case
   */
  toCamelCase(str: string) {
    return str?.replace(/-./g, (match) => match[1].toUpperCase());
  }

  /**
   * Transform first letter to lower case
   */
  lowerCaseFirstLetter(value: string) {
    return this.cmsService.lowerCaseFirstLetter(value);
  }

  /**
   * Calculates sidebar width based on screen size
   */
  calcSideBarWidth() {
    this.sideBarWidth = window.innerWidth < 768 ? '8%' : '22%';
  }
}
