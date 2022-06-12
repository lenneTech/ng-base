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
  @Input() create = true;
  @Input() update = true;
  @Input() delete = true;
  @Input() tableFields = ['id', 'name', 'title', 'description', 'email', 'createdAt', 'updatedAt'];

  @Output() idSelected = new EventEmitter<string>();
  @Output() createModeChanged = new EventEmitter<boolean>();

  meta!: GraphQLMeta;
  objects: any[] = [];
  availableFields: string[] = [];
  selectedId = '';

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
    const possibleFields = this.meta.getFields('find' + this.capitalizeFirstLetter(this.modelName) + 's');
    const keys = Object.keys(possibleFields);
    this.tableFields?.forEach((field) => {
      if (keys.includes(field)) {
        this.availableFields.push(field);
      }
    });

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
      .graphQl('find' + this.capitalizeFirstLetter(this.modelName) + 's', {
        fields,
        type: GraphQLRequestType.QUERY,
      })
      .subscribe({
        next: (value) => {
          this.objects = value;
        },
        error: (err) => {
          console.log('Error on loading objects', err);
        },
      });
  }

  /**
   * If the update property is true, then set the selectedId property to the id of the object passed in, and emit the
   * selectedId property
   *
   * @param object - any - this is the object that is passed in from the child component.
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
