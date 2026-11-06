import { LtBreadcrumb } from './breadcrumb';
import { LtColorModeButton } from './color-mode-button';
import { LtDataView, LtDataViewCell, LtDataViewTile } from './data-view';
import { LtDatePicker } from './date-picker';
import { LtDateTimePicker } from './date-time-picker';
import { LtEnterAction } from './enter-action';
import { LtFooter } from './footer';
import { LtFormField } from './form-field';
import { LtHeader, LtHeaderActions, LtHeaderLogo } from './header';
import { LtNavigationMenu } from './navigation-menu';
import { LtNotice } from './notice';
import { LtPageCard, LtPageCardFooter } from './page-card';
import { LtPageTitle, LtPageTitleActions } from './page-title';
import { LtPasswordInput } from './password-input';
import { LtReadonlyField } from './readonly-field';
import { LtSelect } from './select';
import { LtTextField } from './text-field';
import { LtToolbar } from './toolbar';
import { LtToolbarItem } from './toolbar-item';

/**
 * All lenne.Tech components and directives of `/ui` for a component's `imports` (the Spartan helm parts have their
 * own `Hlm*Imports`).
 *
 * @example @Component({ imports: [LtUiImports, HlmButtonImports], … })
 */
export const LtUiImports = [
  LtBreadcrumb,
  LtColorModeButton,
  LtDataView,
  LtDataViewCell,
  LtDataViewTile,
  LtDatePicker,
  LtDateTimePicker,
  LtEnterAction,
  LtFooter,
  LtFormField,
  LtHeader,
  LtHeaderActions,
  LtHeaderLogo,
  LtNavigationMenu,
  LtNotice,
  LtPageCard,
  LtPageCardFooter,
  LtPageTitle,
  LtPageTitleActions,
  LtPasswordInput,
  LtReadonlyField,
  LtSelect,
  LtTextField,
  LtToolbar,
  LtToolbarItem,
] as const;
