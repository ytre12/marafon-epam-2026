# Group pre-order workflow

Implemented locally; AWS deployment is a separate step.

## Customer flow

1. Create a reservation for two or more people, more than 30 minutes ahead.
2. Open **My reservations → Group pre-order** (also available from the invitation modal).
3. Opening the page initializes a single owner session and a draft order, including for existing open group reservations. Existing draft dishes are copied into the owner cart.
4. Share the invitation link. Guests choose dishes and submit their individual carts.
5. The organizer chooses dishes under **My dishes**, then selects **Submit my cart**.
6. **Refresh participants** reloads the current guest list. The summary distinguishes all selected dishes from submitted carts only.
7. The organizer may remove a guest after confirming. The returned snapshot immediately updates the list and total. The owner cannot be removed.
8. **Confirm group order → Confirm and send** includes only submitted carts, merges quantities by dish ID, marks the order `SubmittedByCustomer` and the group `Submitted`.
9. The resulting order uses the existing waiter review flow. Group cart editing, joining and removal are locked after final submission.

## API

All organizer routes require a Cognito ID token and validate the reservation customer ID. Guest session bearer tokens cannot authorize organizer actions.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/guest/groups/{groupReservationId}/sessions` | `participants` with owner/guest type, dishes, quantities, status, per-person total; overall `total` |
| GET | `/reservations/{reservationId}/guest-session-id` | `guestSessionId`, `groupReservationId`, `status`, `canEdit`, `inviteToken` |
| POST | `/group-reservations/{groupReservationId}/submit` | Body `{ "reservationId": "..." }`; consolidated order ID, items, total and group status |
| DELETE | `/guest/groups/{groupReservationId}/sessions/{guestSessionId}` | Updated participants and total |
| GET | `/reservations/{reservationId}/owner-session/menu` | Menu for this reservation's location |
| POST / DELETE | `/reservations/{reservationId}/owner-session/dishes` | Body `{ "dishId": "...", "quantity": 1 }`; updated group snapshot |
| POST | `/reservations/{reservationId}/owner-session/submit` | Submit the organizer's cart; updated snapshot |

Missing resources return 404; wrong owner 403; missing authentication 401. Invalid group/session association, no submitted dishes, missing order, unavailable dishes and closed groups return 400.

## Consistency and compatibility

- Final order and group status are written in one DynamoDB transaction, with a reservation status/owner check.
- Guest mutations increment a group revision; final confirmation rejects a concurrent cart change rather than silently submitting stale contents.
- Session revisions prevent lost updates and recreating a removed session from a stale request.
- Old records need no migration: missing revisions are handled explicitly.
- Ordinary customer order endpoints reject group reservations, so they cannot bypass group confirmation. Assigned waiters retain their existing order workflow.
- `GuestSessions` listing uses a strongly consistent base-table scan. This is suitable for the small marathon dataset, but for a large installation use a group-partitioned table supporting strongly consistent queries.
- Guest capacity checking remains the existing count-based approach; simultaneous new guest registrations can race at the capacity boundary.
- Totals use current catalogue prices, consistent with the existing application; this is not a payment or price-locking system.

## Deployment scope

Backend source, API Gateway route metadata, Lambda IAM policy and Swagger were changed. Deploying only the frontend or only the Lambda binary is insufficient: publish the API routes and IAM policy too. The frontend production API URL is preserved. No Terraform schema change or table replacement is needed.

## Local verification

From the backend directory:

```sh
dotnet build dnapp/lambdas/api-handler/APIHandler.csproj
dotnet test Tests/APIHandler.Tests.csproj
dotnet run --project Tests/GroupOrders
```

`Tests/GroupOrders` runs 25 offline checks with fake repositories and captured DynamoDB transaction requests. It never contacts AWS.

From the frontend directory:

```sh
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
CI=true BACKEND_URL=https://YOUR_API.execute-api.eu-north-1.amazonaws.com/develop npm run build
CI=true npm test -- --watch=false --browsers=ChromeHeadless
```

`CI=true` bypasses the local Angular disk cache, whose native LMDB module crashed on this Mac. No cache settings were permanently changed.
