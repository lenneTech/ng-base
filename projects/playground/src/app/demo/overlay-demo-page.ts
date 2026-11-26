import { afterNextRender, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LtToastService } from '@lenne.tech/ng-base';
import { HlmButton, LtOverlayService } from '@lenne.tech/ng-base/ui';

/**
 * `/demo`: a toast (`LtToastService` → Sonner) and a confirmation dialog (`LtOverlayService.confirm()`). `/demo?toast`
 * raises the toast right after the first render, before the deferred toaster exists (a page that warns on a direct
 * visit).
 */
@Component({
  imports: [HlmButton, RouterLink],
  selector: 'app-overlay-demo-page',
  templateUrl: './overlay-demo-page.html',
})
export class OverlayDemoPage {
  private readonly toast = inject(LtToastService);
  private readonly overlay = inject(LtOverlayService);
  private readonly route = inject(ActivatedRoute);

  protected readonly answer = signal<'abgebrochen' | 'bestätigt' | null>(null);

  constructor() {
    afterNextRender(() => {
      if (this.route.snapshot.queryParamMap.has('toast')) {
        this.showToast();
      }
    });
  }

  protected showToast(): void {
    this.toast.success('Gespeichert', 'Der Toast aus dem Playground funktioniert.');
  }

  protected async askConfirmation(): Promise<void> {
    const confirmed = await this.overlay.confirm({
      confirmLabel: 'Fortfahren',
      description: 'Diese Aktion lässt sich im Playground gefahrlos ausprobieren.',
      title: 'Wirklich fortfahren?',
    });
    this.answer.set(confirmed ? 'bestätigt' : 'abgebrochen');
  }
}
