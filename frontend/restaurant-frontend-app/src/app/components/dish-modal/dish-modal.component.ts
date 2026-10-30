import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, Input, Output, EventEmitter, OnInit, inject, DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishesService } from '@app/services/dishes/dishes.service';

@Component({
  selector: 'app-dish-modal',
  standalone: true,
  imports: [TranslatePipe, A11yModule, CurrencyPipe],
  templateUrl: './dish-modal.component.html',
  styleUrl: './dish-modal.component.scss',
  host: { '(document:keydown.escape)': 'onClose()' },
})
export class DishModalComponent implements OnInit {
  @Input({ required: true }) dish!: DishListResponse;
  @Output() closed = new EventEmitter<void>();
  private readonly dishes = inject(DishesService);
  private readonly destroyRef = inject(DestroyRef);
  readonly details = signal<DishListResponse | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  ngOnInit(): void {
    this.dishes.getDishById(this.dish.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (dish) => { this.details.set(dish); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); },
    });
  }

  nutrition(value: string | number | null | undefined, unit: string): string {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    const text = String(value).trim();
    return /^\d+(?:[.,]\d+)?$/.test(text) ? `${text} ${unit}` : text;
  }

  onClose(): void { this.closed.emit(); }
}
