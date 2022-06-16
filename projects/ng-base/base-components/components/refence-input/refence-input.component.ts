import { Component, Input, OnInit } from '@angular/core';
import { GraphQLRequestType, GraphQLService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-refence-input',
  templateUrl: './refence-input.component.html',
  styleUrls: ['./refence-input.component.scss'],
})
export class RefenceInputComponent implements OnInit {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: any;
  @Input() required = false;
  @Input() method = 'find';
  @Input() fields = ['id', 'name'];
  @Input() valueField = 'id';
  @Input() nameField = 'name';
  objects: any[] = [];

  constructor(private graphQLService: GraphQLService) {}

  ngOnInit(): void {
    this.graphQLService
      .graphQl(this.method, {
        fields: this.fields,
        type: GraphQLRequestType.QUERY,
      })
      .subscribe((result) => {
        if (result) {
          this.objects = result;
        }
      });
  }
}
