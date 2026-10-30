import { Component, input, signal } from '@angular/core';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { DishModalComponent } from './dish-modal.component';

@Component({
  selector: 'app-dish-details-button',
  standalone: true,
  imports: [TranslatePipe, DishModalComponent],
  template: `
    <button type="button" class="button button--secondary button--small"
      (click)="open($event)">{{ 'Dish details' | translate }}</button>
    @if (opened()) {
      <app-dish-modal [dish]="dish()" (closed)="opened.set(false)" />
    }
  `,
  host: { '(click)': '$event.stopPropagation()', '(keydown)': '$event.stopPropagation()' },
})
export class DishDetailsButtonComponent {
  readonly dish = input.required<DishListResponse>();
  readonly opened = signal(false);

  open(event: Event): void {
    event.stopPropagation();
    this.opened.set(true);
  }
}
