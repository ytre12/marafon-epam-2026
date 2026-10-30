import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageSwitchComponent } from './language-switch.component';
import { LanguageService } from './language.service';
import { TranslatePipe } from './translate.pipe';
import { LocalizedDatePipe } from './localized-date.pipe';
import { CustomSelectComponent } from '../custom-components/custom-select/custom-select.component';

@Component({
  imports: [LanguageSwitchComponent, TranslatePipe, LocalizedDatePipe],
  template: `<app-language-switch />
    <h1>{{ 'Menu' | translate }}</h1>
    <p class="dish">{{ dishName }}</p>
    <p class="error" role="alert">{{ serverError }}</p>
    <input [placeholder]="'Enter Your Name' | translate" [value]="guestName" />
    <time>{{ date | localizedDate: 'MMMM' : 'UTC' }}</time>`,
})
class LanguageTestComponent {
  dishName = 'Menu'; // Deliberately matches an interface key; API content must remain unchanged.
  serverError = 'Reserved';
  guestName = 'Олена';
  date = '2026-10-29T12:00:00Z';
}

describe('Interface language switch', () => {
  let previous: string | null;
  beforeEach(() => {
    previous = localStorage.getItem('restaurant.interface-language');
    localStorage.removeItem('restaurant.interface-language');
    TestBed.configureTestingModule({ imports: [LanguageTestComponent, CustomSelectComponent] });
  });
  afterEach(() => {
    if (previous === null) localStorage.removeItem('restaurant.interface-language');
    else localStorage.setItem('restaurant.interface-language', previous);
    document.documentElement.lang = 'en';
  });
  it('updates visible copy and dates without replacing API text, errors, or form values', () => {
    const fixture = TestBed.createComponent(LanguageTestComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('button[lang="uk"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('h1')!.textContent).toBe('Меню');
    expect(element.querySelector('.dish')!.textContent).toBe('Menu');
    expect(element.querySelector('.error')!.textContent).toBe('Reserved');
    expect(element.querySelector('input')!.value).toBe('Олена');
    expect(element.querySelector('input')!.placeholder).toBe('Введіть ім’я');
    expect(element.querySelector('time')!.textContent).toBe('жовтня');
    expect(element.querySelector('button[lang="uk"]')!.getAttribute('aria-pressed')).toBe('true');
    element.querySelector<HTMLButtonElement>('button[lang="en"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('h1')!.textContent).toBe('Menu');
    expect(element.querySelector('time')!.textContent).toBe('October');
  });
  it('never translates database-backed select options by default', () => {
    const fixture = TestBed.createComponent(CustomSelectComponent);
    fixture.componentRef.setInput('options', [{ value: 'location-1', text: 'Menu' }]);
    fixture.componentRef.setInput('selectedOption', { value: 'location-1', text: 'Menu' });
    TestBed.inject(LanguageService).setLanguage('uk');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.selected-text')!.textContent?.trim()
    ).toBe('Menu');
  });
  it('translates declared UI options without changing emitted values', () => {
    const fixture = TestBed.createComponent(CustomSelectComponent);
    fixture.componentRef.setInput('options', ['Sales']);
    fixture.componentRef.setInput('translateOptions', true);
    TestBed.inject(LanguageService).setLanguage('uk');
    fixture.componentInstance.dropdownOpen.set(true);
    const emitted = jasmine.createSpy('option');
    fixture.componentInstance.optionSelected.subscribe(emitted);
    fixture.detectChanges();
    const option = (fixture.nativeElement as HTMLElement).querySelector('li')!;
    expect(option.textContent?.trim()).toBe('Продажі');
    option.click();
    expect(emitted).toHaveBeenCalledWith('Sales');
  });
});
