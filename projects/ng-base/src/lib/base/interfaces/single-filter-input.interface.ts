import { ComparisonOperatorEnum } from '../enums/comparison-operator.enum';

/**
 * Single filter input kjhg
 */
export interface SingleFilterInput {
  field: string;
  not?: boolean;
  operator: ComparisonOperatorEnum;
  options?: string;
  value: any;
}
