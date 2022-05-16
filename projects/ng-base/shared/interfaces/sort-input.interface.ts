import { SortOrderEnum } from '../enums/sort-order.enum';

export interface SortInput {
  field: string;
  order: SortOrderEnum;
}
