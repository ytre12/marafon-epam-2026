import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { UK_TRANSLATIONS } from './uk';

export type InterfaceLanguage = 'en' | 'uk';
const STORAGE_KEY = 'restaurant.interface-language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly currentLanguage = signal<InterfaceLanguage>(this.readPreference());
  readonly language = this.currentLanguage.asReadonly();

  constructor() {
    this.document.documentElement.lang = this.language();
  }

  setLanguage(language: InterfaceLanguage): void {
    if (language !== 'en' && language !== 'uk') return;
    this.currentLanguage.set(language);
    this.document.documentElement.lang = language;
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The switch still works when browser storage is unavailable.
    }
  }

  translate(text: string | null | undefined): string {
    if (text == null) return '';
    return this.language() === 'uk' ? (UK_TRANSLATIONS[text] ?? text) : text;
  }

  private readPreference(): InterfaceLanguage {
    try {
      return this.document.defaultView?.localStorage.getItem(STORAGE_KEY) === 'uk' ? 'uk' : 'en';
    } catch {
      return 'en';
    }
  }
}
