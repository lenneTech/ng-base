import { ToastType } from '../enums/toast-type.enum';

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  description?: string;
  errorCode?: string;
}
