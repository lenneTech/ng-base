import * as lt from './index';
import { LtUiImports } from './imports';

describe('LtUiImports', () => {
  it('contains every exported lt component and directive', () => {
    const declarables = Object.entries(lt)
      .filter(([name, value]) => /^Lt[A-Z]/.test(name) && typeof value === 'function' && ('ɵcmp' in value || 'ɵdir' in value))
      .map(([, value]) => value);
    const expected = declarables.filter((value) => value !== lt.LtConfirmDialog);
    expect(new Set(LtUiImports)).toEqual(new Set(expected));
  });
});
