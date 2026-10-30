export interface GroupParticipant {
  id: string;
  type: 'Owner' | 'Guest';
  name: string;
  items: { dish: { id: string; name: string; price: number }; quantity: number }[];
  total: number;
  isSubmitted: boolean;
}
export interface GroupSnapshot {
  participants: GroupParticipant[];
  total: number;
}
export interface OwnerSession {
  guestSessionId: string;
  groupReservationId: string;
  status: 'Open' | 'Submitted' | 'Closed';
  canEdit: boolean;
  inviteToken: string;
}
export interface SubmittedGroup {
  orderId: string;
  status: 'Submitted';
  total: number;
}
