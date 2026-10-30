import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-green-tasty-image',
  imports: [TranslatePipe, ],
  templateUrl: './green-tasty-image.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './green-tasty-image.component.scss',
})
export class GreenTastyImageComponent {}
