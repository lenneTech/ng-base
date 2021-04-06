import { LogicalOperatorEnum } from '../enums/logical-operator.enum';
import { FilterInput } from './filter-input.interface';

/**
 * Combined filter input
 */
export interface CombinedFilterInput {
  logicalOperator?: LogicalOperatorEnum;
  filters?: FilterInput[];
}
