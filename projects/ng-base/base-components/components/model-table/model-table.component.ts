import {
  AfterViewInit,
  Component,
  ComponentRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import {
  CMSFieldConfig,
  CMSModelConfig,
  CmsService,
  CMSTableField,
  GraphQLMeta,
  GraphQLMetaService,
  GraphQLRequestType,
  GraphQLService,
  GraphQLType,
  ScrollService,
  StorageService,
  ToastService,
  ToastType
} from '@lenne.tech/ng-base/shared';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DatePipe, NgClass } from '@angular/common';
import { SelectComponent } from '../select/select.component';
import { ContextMenuDirective } from '../../directives/context-menu.directive';
import { SortDirective } from '../../directives/sort.directive';
import { EllipsesPipe } from '../../pipes/ellipses.pipe';
import { ModelFormComponent } from '../model-form/model-form.component';
import { FabButtonComponent } from '../fab-button/fab-button.component';

@Component({
  selector: 'base-model-table',
  templateUrl: './model-table.component.html',
  styleUrls: ['./model-table.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    SelectComponent,
    ContextMenuDirective,
    SortDirective,
    DatePipe,
    EllipsesPipe,
    ModelFormComponent,
    FabButtonComponent,
  ]
})
export class ModelTableComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() modelName: string;
  @Input() objectId: string;
  @Input() createMode = false;
  @Input() logging = false;
  @Input() create = true;
  @Input() update = true;
  @Input() delete = true;
  @Input() import = true;
  @Input() export = true;
  @Input() duplicate = true;
  @Input() modelConfig: CMSModelConfig = null;
  @Input() config: { [key: string]: CMSFieldConfig };
  @Input() showFavButton = false;

  @Output() idSelected = new EventEmitter<string>();
  @Output() createModeChanged = new EventEmitter<boolean>();

  @ViewChild('customFormTemplate', { read: ViewContainerRef }) customFormTemplate: ViewContainerRef;

  uniqueField = 'id';
  tableFields: CMSTableField = {
    id: { label: 'ID' },
    name: { label: 'Name' },
    title: { label: 'Titel' },
    description: { label: 'Beschreibung' },
    email: { label: 'E-Mail' },
    createdAt: { label: 'Erstellt am', dateFormat: 'dd.MM.YYYY HH:mm' },
    updatedAt: { label: 'Bearbeitet am', dateFormat: 'dd.MM.YYYY HH:mm' },
  };
  meta!: GraphQLMeta;
  objects: any[] = [];
  availableFields: string[] = [];
  id = '';
  queryName: string = null;
  camelModelName: string;
  possibleFields: Record<string, GraphQLType> = {};
  componentRef: ComponentRef<any> = undefined;

  totalCount: number;
  selectedPageIndex = 0;
  pages = [];
  pageItemsLimitControl = new FormControl(25);
  pageOptions = [
    {
      text: '25',
      value: 25,
    },
    {
      text: '50',
      value: 50,
    },
    {
      text: '75',
      value: 75,
    },
    {
      text: '100',
      value: 100,
    },
    {
      text: '200',
      value: 200,
    },
  ];
  subscription = new Subscription();

  constructor(
    private graphQLMetaService: GraphQLMetaService,
    private graphQLService: GraphQLService,
    private cmsService: CmsService,
    private toastService: ToastService,
    private scrollService: ScrollService,
    private storageService: StorageService
  ) {}

  ngAfterViewInit() {
    // Needed time out to prevent ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.integrateCustomFormComponent();
    }, 10);
  }

  ngOnInit(): void {
    const pageItemsLimit = this.storageService.load('pageItemsLimit');
    this.pageItemsLimitControl.setValue(pageItemsLimit ? pageItemsLimit : 25, { onlySelf: true, emitEvent: false });

    this.graphQLMetaService.getMeta().subscribe((meta) => {
      this.meta = meta;

      if (this.modelName) {
        this.init();
      }

      if (this.objectId) {
        this.id = this.objectId;

        // Needed time out for rerender
        setTimeout(() => {
          this.integrateCustomFormComponent();
        }, 10);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['modelName'] && this.meta) {
      this.init();
    }

    if (changes['objectId'] && this.meta) {
      if (this.id !== this.objectId) {
        if (this.logging) {
          console.log('ModelTableComponent::ngOnChanges->selectedId', this.id);
        }

        this.id = this.objectId;
      }
    }

    this.setChangesInComponentRef();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /**
   * We're using the `meta` service to get the fields that are available for the `find` query for the model we're working
   * with. We're then using that information to populate the `availableFields` array
   */
  async init() {
    this.availableFields = [];
    this.pages = [];
    this.totalCount = null;
    this.camelModelName = this.kebabToCamelCase(this.modelName);

    // Set query name
    if (!this.modelConfig?.queryName) {
      this.queryName = 'findAndCount' + this.capitalizeFirstLetter(this.camelModelName) + 's';
    } else {
      this.queryName = this.modelConfig?.queryName;
    }

    if (this.modelConfig?.tableFields) {
      this.tableFields = this.modelConfig.tableFields;
    }

    if (this.logging) {
      console.log('ModelTableComponent::init->modelName', this.modelName);
      console.log('ModelTableComponent::init->camelModelName', this.camelModelName);
      console.log('ModelTableComponent::init->queryName', this.queryName);
      console.log('ModelTableComponent::init->tableFields', this.tableFields);
    }

    this.possibleFields = this.meta.getFields(this.queryName).fields;
    let keys;
    if (this.possibleFields?.items && Object.keys(this.possibleFields?.items?.fields).length > 0) {
      keys = Object.keys(this.possibleFields.items.fields);
    } else {
      keys = Object.keys(this.possibleFields);
    }

    const tableFieldKeys = Object.keys(this.tableFields);
    tableFieldKeys?.forEach((field) => {
      if (keys.includes(field)) {
        this.availableFields.push(field);
      }
    });

    if (this.logging) {
      console.log('ModelTableComponent::init->possibleFields', this.possibleFields);
      console.log('ModelTableComponent::init->keys', keys);
      console.log('ModelTableComponent::init->availableFields', this.availableFields);
    }

    this.selectedPageIndex = this.storageService.load('pageIndex') ? this.storageService.load('pageIndex') : 0;
    this.objects = await this.loadObjects(this.availableFields, 0, this.pageItemsLimitControl.value);
    this.subscribeToPageItems();
  }

  subscribeToPageItems() {
    this.subscription.add(
      this.pageItemsLimitControl.valueChanges.subscribe({
        next: async (value) => {
          this.selectedPageIndex = 0;
          this.storageService.save('pageIndex', this.selectedPageIndex);
          this.objects = await this.loadObjects(this.availableFields, 0, value);
          this.storageService.save('pageItemsLimit', value);
        },
      })
    );
  }

  integrateCustomFormComponent() {
    if (!this.customFormTemplate || this.componentRef) {
      return;
    }

    const customComponent = this.modelConfig?.customTemplateComponent;
    if (customComponent) {
      this.componentRef = this.customFormTemplate?.createComponent<any>(customComponent);
      this.setChangesInComponentRef();
      this.componentRef.instance.finished.subscribe(() => {
        this.selectId('');
      });
    }
  }

  setChangesInComponentRef() {
    if (this.componentRef) {
      const data = {
        config: this.config,
        delete: this.delete,
        duplicate: this.duplicate,
        id: this.id,
        label: this.modelConfig?.label,
        logging: this.logging,
        modelName: this.camelModelName,
        showFavButton: this.showFavButton,
      };

      for (const [key, value] of Object.entries(data)) {
        this.componentRef.setInput(key, value);
      }
    }
  }

  /**
   * When the user clicks the "Create New" button, the createModeChanged event is emitted, which is then handled by the
   * parent component
   */
  createNewObject() {
    this.createMode = true;
    this.createModeChanged.emit(true);
  }

  /**
   * It loads the objects from the database and stores them in the objects variable
   *
   * @param fields - string[] - The fields you want to load from the database.
   * @param skip
   * @param limit
   */
  loadObjects(fields: string[], skip = 0, limit = 25): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      const requestFields = [...fields];
      const idInFields = requestFields.find((e) => e === 'id');

      if (!idInFields) {
        requestFields.push('id');
      }

      const isFindAndCount = this.queryName.includes('findAndCount');

      this.graphQLService
        .graphQl(this.queryName, {
          arguments: {
            limit: isFindAndCount ? limit : null,
            skip: isFindAndCount ? skip : null,
          },
          fields: isFindAndCount ? ['totalCount', { items: requestFields }] : requestFields,
          type: GraphQLRequestType.QUERY,
        })
        .subscribe({
          next: (value) => {
            let items;
            if (this.logging) {
              console.log('ModelTableComponent::loadObjects->value', value);
            }

            if (value?.totalCount >= 0) {
              items = value.items;
              this.totalCount = value.totalCount;
              this.pages = [];
              let numbers = 0;

              while (numbers < this.totalCount) {
                this.pages.push({
                  skip: numbers,
                  limit: this.pageItemsLimitControl.value,
                });

                numbers = numbers + this.pageItemsLimitControl.value;
              }

              const loadedIndex = this.storageService.load('pageIndex');
              if (loadedIndex) {
                if (loadedIndex > this.pages.length) {
                  this.selectedPageIndex = 0;
                  this.storageService.save('pageIndex');
                }
              }
            } else {
              items = value;
            }

            resolve(items);
          },
          error: (err) => {
            console.log('Error on loading objects', err);
            reject(err);
          },
        });
    });
  }

  /**
   * If the update property is true, then set the selectedId property to the id of the object passed in, and emit the
   * selectedId property
   */
  selectId(object: any) {
    if (!object) {
      this.createMode = false;
      this.createModeChanged.emit(false);
    }

    if (this.update) {
      this.id = object['id'];
      this.idSelected.emit(this.id);
    }
  }

  openNewTab(object: any) {
    window.open(location.href + '/' + object['id'], '_blank');
  }

  /**
   * It calls the duplicateObject function in the cmsService, passing in the id of the object to be duplicated and the
   * modelName of the object
   */
  async duplicateObject(id: string) {
    await this.cmsService.duplicateObject(id, this.camelModelName);
    this.selectedPageIndex = this.storageService.load('pageIndex') ? this.storageService.load('pageIndex') : 0;
    this.objects = await this.loadObjects(
      this.availableFields,
      this.pages[this.selectedPageIndex].skip,
      this.pages[this.selectedPageIndex].limit
    );
  }

  /**
   * It calls the deleteObject function in the cmsService, passing in the id of the object to delete and the name of the
   * model
   */
  async deleteObject(id: string) {
    await this.cmsService.deleteObject(id, this.camelModelName);
    this.selectedPageIndex = this.storageService.load('pageIndex') ? this.storageService.load('pageIndex') : 0;
    this.objects = await this.loadObjects(
      this.availableFields,
      this.pages[this.selectedPageIndex].skip,
      this.pages[this.selectedPageIndex].limit
    );
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the modified string
   */
  capitalizeFirstLetter(value: string) {
    return this.cmsService.capitalizeFirstLetter(value);
  }

  /**
   * Kebab to camel case string
   */
  kebabToCamelCase(str: string) {
    return str.replace(/-./g, (match) => match[1].toUpperCase());
  }

  /**
   * Import objects from json file
   */
  processImport(event) {
    // Create a new FileReader() object
    const reader = new FileReader();

    // Setup the callback event to run when the file is read
    reader.onload = async (readerEvent) => {
      let jsonResult = JSON.parse(readerEvent.target.result as any);

      if (!Array.isArray(jsonResult)) {
        jsonResult = [jsonResult];
      }

      for (let i = 0; i < jsonResult.length; i++) {
        try {
          this.graphQLService
            .graphQl('create' + this.capitalizeFirstLetter(this.modelName), {
              arguments: { input: jsonResult[i] },
              fields: ['id'],
              type: GraphQLRequestType.MUTATION,
            })
            .subscribe({
              next: async () => {
                this.toastService.show({
                  id: this.modelName + '-' + i + '-success',
                  type: ToastType.SUCCESS,
                  title: 'Erfolgreich',
                  description: 'Element ' + (i + 1) + ' von ' + jsonResult.length + ' erfolgreich importiert.',
                });

                if (i === jsonResult.length - 1) {
                  this.selectedPageIndex = this.storageService.load('pageIndex')
                    ? this.storageService.load('pageIndex')
                    : 0;
                  this.objects = await this.loadObjects(
                    this.availableFields,
                    this.pages[this.selectedPageIndex].skip,
                    this.pages[this.selectedPageIndex].limit
                  );
                }
              },
              error: () => {
                this.toastService.show({
                  id: this.modelName + '-' + i + '-error',
                  type: ToastType.ERROR,
                  title: 'Error',
                  description: 'Element ' + (i + 1) + ' von ' + jsonResult.length + ' konnte nicht importiert werden.',
                });
              },
            });
        } catch (e) {
          this.toastService.show({
            id: this.modelName + '-' + i + '-error',
            type: ToastType.ERROR,
            title: 'Error',
            description: 'Element ' + (i + 1) + ' von ' + jsonResult.length + ' konnte nicht importiert werden.',
          });
        }
      }
    };

    // Read the file
    reader.readAsText(event.target.files[0]);
  }

  /**
   * Export objects as json
   */
  async processExport() {
    const keys = this.getAllKeys();
    const items = await this.loadObjects(
      keys,
      this.pages[this.selectedPageIndex].skip,
      this.pages[this.selectedPageIndex].limit
    );
    const data = JSON.stringify(items);
    const blob = new Blob([data], { type: 'text/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', this.modelName + 's.json');
    document.body.appendChild(link);
    link.click();
  }

  /**
   * Get all keys for request to export objects as json
   */
  getAllKeys() {
    const items = [];
    for (const [key, value] of Object.entries(this.possibleFields)) {
      if (!this.possibleFields[key].fields || Object.keys(this.possibleFields[key].fields).length === 0) {
        items.push(key);
      }
    }

    return items;
  }

  async selectPage(i: number) {
    if (!this.pages[i]) {
      return;
    }

    this.selectedPageIndex = i;
    await this.scrollService.scrollTo('model-table-top');
    this.storageService.save('pageIndex', this.selectedPageIndex);
    this.objects = await this.loadObjects(
      this.availableFields,
      this.pages[this.selectedPageIndex].skip,
      this.pages[this.selectedPageIndex].limit
    );
  }
}
