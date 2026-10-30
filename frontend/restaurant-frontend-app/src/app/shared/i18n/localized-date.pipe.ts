import { DatePipe, registerLocaleData } from '@angular/common';
import ukrainianLocale from '@angular/common/locales/uk';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

registerLocaleData(ukrainianLocale);

@Pipe({ name: 'localizedDate', standalone: true, pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(
    value: Date | string | number | null | undefined,
    format = 'mediumDate',
    timezone?: string
  ): string | null {
    return new DatePipe(this.language.language() === 'uk' ? 'uk' : 'en-US').transform(
      value,
      format,
      timezone
    );
  }
}
