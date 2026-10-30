import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(text: string | null | undefined): string {
    return this.language.translate(text);
  }
}
