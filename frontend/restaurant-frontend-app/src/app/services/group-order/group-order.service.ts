import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GuestMenuResponse } from '../guest-sessions/guest-sessions.service';

import {
  GroupSnapshot,
  OwnerSession,
  SubmittedGroup,
} from '@app/models/group-order/group-order.model';

@Injectable({ providedIn: 'root' })
export class GroupOrderService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  owner(reservationId: string) {
    return this.http.get<OwnerSession>(
      `${this.base}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`
    );
  }
  sessions(groupId: string) {
    return this.http.get<GroupSnapshot>(
      `${this.base}/guest/groups/${encodeURIComponent(groupId)}/sessions`
    );
  }
  menu(reservationId: string) {
    return this.http.get<GuestMenuResponse>(`${this.ownerPath(reservationId)}/menu`);
  }
  changeDish(reservationId: string, dishId: string, add: boolean) {
    return this.http.request<GroupSnapshot>(
      add ? 'POST' : 'DELETE',
      `${this.ownerPath(reservationId)}/dishes`,
      { body: { dishId, quantity: 1 } }
    );
  }
  submitOwnCart(reservationId: string) {
    return this.http.post<GroupSnapshot>(`${this.ownerPath(reservationId)}/submit`, {});
  }
  remove(groupId: string, sessionId: string) {
    return this.http.delete<GroupSnapshot>(
      `${this.base}/guest/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}`
    );
  }
  submit(groupId: string, reservationId: string) {
    return this.http.post<SubmittedGroup>(
      `${this.base}/group-reservations/${encodeURIComponent(groupId)}/submit`,
      { reservationId }
    );
  }
  private ownerPath(reservationId: string) {
    return `${this.base}/reservations/${encodeURIComponent(reservationId)}/owner-session`;
  }
}
