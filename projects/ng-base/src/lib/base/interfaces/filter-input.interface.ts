import { SingleFilterInput } from './single-filter-input.interface';
import { CombinedFilterInput } from './combined-filter-input.interface';

/**
 * Filter input
 */
export interface FilterInput {
  combinedFilter?: CombinedFilterInput;
  singleFilter?: SingleFilterInput;
}
