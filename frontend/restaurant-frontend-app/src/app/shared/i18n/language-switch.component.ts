import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="language-switch" role="group" aria-label="Interface language / Мова інтерфейсу">
      <button
        type="button"
        lang="en"
        aria-label="English"
        [attr.aria-pressed]="language.language() === 'en'"
        (click)="language.setLanguage('en')"
      >
        EN
      </button>
      <button
        type="button"
        lang="uk"
        aria-label="Українська"
        [attr.aria-pressed]="language.language() === 'uk'"
        (click)="language.setLanguage('uk')"
      >
        УКР
      </button>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .language-switch {
      display: flex;
      padding: 3px;
      gap: 2px;
      border: 1px solid #b7c6ba;
      border-radius: 8px;
      background: #fff;
    }
    button {
      min-width: 42px;
      min-height: 36px;
      padding: 6px 8px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #294a34;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button[aria-pressed='true'] {
      color: #fff;
      background: #326444;
    }
    button:focus-visible {
      outline: 3px solid #619c73;
      outline-offset: 2px;
    }
  `,
})
export class LanguageSwitchComponent {
  readonly language = inject(LanguageService);
}
