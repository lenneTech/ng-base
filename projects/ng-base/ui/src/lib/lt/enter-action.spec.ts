import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LtEnterAction } from './enter-action';

@Component({
  imports: [LtEnterAction],
  template: `<form><input (ltEnterAction)="codes.push($event)" /></form>`,
})
class EnterHost {
  readonly codes: string[] = [];
}

function enter(input: HTMLInputElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ...init });
  input.dispatchEvent(event);
  return event;
}

describe('LtEnterAction', () => {
  it('emits the value on ENTER and prevents the form submit', async () => {
    const fixture = TestBed.createComponent(EnterHost);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    input.value = '4006381333931';
    const event = enter(input);
    expect(fixture.componentInstance.codes).toEqual(['4006381333931']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores ENTER during an IME composition and other keys', async () => {
    const fixture = TestBed.createComponent(EnterHost);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    enter(input, { isComposing: true });
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    expect(fixture.componentInstance.codes).toEqual([]);
  });
});
