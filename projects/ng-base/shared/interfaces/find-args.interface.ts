import { FilterInput } from './filter-input.interface';
import { SortInput } from './sort-input.interface';

export interface FindArgs {
  limit?: number;
  offset?: number;
  skip?: number;
  sort?: SortInput[];
  take?: number;
  samples?: number;
  filter?: FilterInput;
}
