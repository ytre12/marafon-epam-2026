import { LocalizedDatePipe } from '@app/shared/i18n/localized-date.pipe';
import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { TimeRange } from '@app/models/tables/time-range.model';
import { formatTime } from '@app/shared/helpers/date-helpers';

@Component({
  selector: 'app-time-slot',
  templateUrl: './time-slot.component.html',
  standalone: true,
  imports: [LocalizedDatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './time-slot.component.scss',
})
export class TimeSlotComponent {
  @Input() timeRange!: TimeRange;
  @Input() label?: string;
  @Input() disabled = false;
  @Input() showDate = false;

  formatTimeRange(start: string): string {
    return `${formatTime(start)}`;
  }
}
