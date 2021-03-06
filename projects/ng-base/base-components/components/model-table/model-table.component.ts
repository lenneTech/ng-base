import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { GraphQLMeta, GraphQLMetaService, GraphQLRequestType, GraphQLService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-model-table',
  templateUrl: './model-table.component.html',
  styleUrls: ['./model-table.component.scss'],
})
export class ModelTableComponent implements OnInit, OnChanges {
  @Input() modelName: string;
  @Input() objectId: string;
  @Input() createMode = false;
  @Input() logging = false;
  @Input() create = true;
  @Input() update = true;
  @Input() delete = true;
  @Input() duplicate = true;
  @Input() config: any = {};
  @Input() fieldConfig: any = {};

  @Output() idSelected = new EventEmitter<string>();
  @Output() createModeChanged = new EventEmitter<boolean>();

  tableFields = {
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
  selectedId = '';
  queryName = null;

  constructor(private graphQLMetaService: GraphQLMetaService, private graphQLService: GraphQLService) {}

  ngOnInit(): void {
    this.graphQLMetaService.getMeta().subscribe((meta) => {
      this.meta = meta;

      if (this.modelName) {
        this.init();
      }

      if (this.objectId) {
        this.selectedId = this.objectId;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['modelName'] && this.meta) {
      this.init();
    }

    if (changes['objectId'] && this.meta) {
      if (this.selectedId !== this.objectId) {
        if (this.logging) {
          console.log('ModelTableComponent::ngOnChanges->selectedId', this.selectedId);
        }

        this.selectedId = this.objectId;
      }
    }
  }

  /**
   * We're using the `meta` service to get the fields that are available for the `find` query for the model we're working
   * with. We're then using that information to populate the `availableFields` array
   */
  init() {
    this.availableFields = [];

    // Set query name
    if (!this.config?.queryName) {
      this.queryName = 'find' + this.capitalizeFirstLetter(this.modelName) + 's';
    } else {
      this.queryName = this.config?.queryName;
    }

    if (this.config?.tableFields) {
      this.tableFields = this.config.tableFields;
    }

    const possibleFields = this.meta.getFields(this.queryName);
    const keys = Object.keys(possibleFields);
    const tableFieldKeys = Object.keys(this.tableFields);
    tableFieldKeys?.forEach((field) => {
      if (keys.includes(field)) {
        this.availableFields.push(field);
      }
    });

    if (this.logging) {
      console.log('ModelTableComponent::init->possibleFields', possibleFields);
      console.log('ModelTableComponent::init->keys', keys);
      console.log('ModelTableComponent::init->availableFields', this.availableFields);
    }

    this.loadObjects(this.availableFields);
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
   */
  loadObjects(fields: string[]) {
    this.objects = [];
    this.graphQLService
      .graphQl(this.queryName, {
        fields,
        type: GraphQLRequestType.QUERY,
      })
      .subscribe({
        next: (value) => {
          if (this.logging) {
            console.log('ModelTableComponent::loadObjects->value', value);
          }

          const arrayForSort = [...value];
          this.objects = arrayForSort.sort(
            (a, b) =>
              (b?.createdAt ? new Date(b?.createdAt)?.getTime() : new Date().getTime()) -
              (a?.createdAt ? new Date(a?.createdAt)?.getTime() : new Date().getTime())
          );
        },
        error: (err) => {
          console.log('Error on loading objects', err);
        },
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
      this.selectedId = object['id'];
      this.idSelected.emit(this.selectedId);
    }
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the modified string
   *
   * @param value - The string to capitalize.
   * @returns The first letter of the string is being capitalized and the rest of the string is being returned.
   */
  capitalizeFirstLetter(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
