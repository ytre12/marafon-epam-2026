using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.Model;
using APIHandler.Constants;
using APIHandler.Constants.Dishes;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Locations;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace APIHandler.Services.GuestSessions;

public record OwnerSessionInfo(string GuestSessionId, string GroupReservationId, string Status, bool CanEdit, string InviteToken);

public class OwnerGroupService(IReservationRepository reservations, IGroupReservationRepository groups,
    IGuestSessionRepository sessions, IOrderRepository orders, ILocationRepository locations,
    IDishRepository dishes, IDynamoDBContext context, IAmazonDynamoDB client)
{
    public async Task<(Reservation Reservation, GroupReservation Group)> AuthorizeAsync(string userId, string reservationId)
    {
        var reservation = await reservations.GetReservationByIdAsync(reservationId)
            ?? throw new ReservationNotFoundException("Reservation not found.");
        if (reservation.CustomerId != userId)
            throw new ActionForbiddenException("Only the reservation owner can manage this group.");
        var indexed = await groups.GetByReservationIdAsync(reservationId)
            ?? throw new GroupReservationNotFoundException();
        var group = await groups.GetGroupReservationByIdAsync(indexed.GroupReservationId)
            ?? throw new GroupReservationNotFoundException();
        return (reservation, group);
    }

    public static bool CanEdit(Reservation reservation, GroupReservation group) =>
        group.Status == GroupReservationStatus.Open && reservation.Status == ReservationStatus.Reserved &&
        reservation.StartTime.ToUniversalTime() > DateTime.UtcNow.AddMinutes(30);

    public async Task<OwnerSessionInfo> GetOwnerAsync(string userId, string reservationId)
    {
        var (reservation, group) = await AuthorizeAsync(userId, reservationId);
        var owner = (await sessions.GetAllByGroupReservationIdAsync(group.GroupReservationId))
            .SingleOrDefault(s => s.IsOwnerSession && s.OwnerUserId == userId);
        if (owner == null)
        {
            if (!CanEdit(reservation, group)) throw new ValidationException("This group is no longer editable.");
            // Deterministic key plus conditional write makes repeated initialization safe.
            owner = new GuestSession { Id = "owner-" + group.GroupReservationId,
                GroupReservationId = group.GroupReservationId, GuestName = "Owner", OwnerUserId = userId,
                IsOwnerSession = true, Dishes = [] };
            var existingOrder = await orders.GetOrderByReservationIdAsync(reservationId);
            if (existingOrder != null && existingOrder.Status != OrderStatus.Created)
                throw new ValidationException("This reservation already has a submitted order.");
            if (existingOrder != null) owner.Dishes = existingOrder.Dishes;
            try { await sessions.SaveAsync(owner); }
            catch (ValidationException)
            {
                owner = await sessions.GetByGuestSessionId(owner.Id) ?? throw new ValidationException("Refresh and try again.");
            }
        }
        if (CanEdit(reservation, group)) await EnsureDraftAsync(reservation);
        return new(owner.Id, group.GroupReservationId, group.Status.ToString(), CanEdit(reservation, group), group.ReservationToken);
    }

    private async Task EnsureDraftAsync(Reservation reservation)
    {
        var id = "group-order-" + reservation.Id;
        if (await orders.GetOrderByIdAsync(id, reservation.CustomerId!) != null ||
            await orders.GetOrderByReservationIdAsync(reservation.Id) != null) return;
        var table = await locations.GetTableByIdAsync(reservation.TableId)
            ?? throw new ValidationException("Table not found.");
        var location = await locations.GetLocationByIdAsync(table.LocationId)
            ?? throw new ValidationException("Location not found.");
        var order = new Order { OrderId = id, CustomerId = reservation.CustomerId!, ReservationId = reservation.Id,
            ReservationAddress = $"{location.Address}, Table {table.TableNumber}",
            ReservationTime = $"{reservation.StartTime:MMM dd, yyyy, HH:mm} - {reservation.EndTime:HH:mm}",
            Dishes = [], Status = OrderStatus.Created };
        try
        {
            await client.PutItemAsync(new PutItemRequest { TableName = ResourceNames.OrdersTableName,
                Item = context.ToDocument(order).ToAttributeMap(), ConditionExpression = "attribute_not_exists(orderId)" });
        }
        catch (ConditionalCheckFailedException) { /* Another request initialized this same draft. */ }
    }

    public async Task<object> SubmitAsync(string userId, string groupId, string reservationId)
    {
        var (reservation, group) = await AuthorizeAsync(userId, reservationId);
        if (group.GroupReservationId != groupId) throw new ValidationException("Group does not belong to this reservation.");
        if (!CanEdit(reservation, group)) throw new ValidationException("This group is closed or already submitted.");
        var items = GroupOrderRules.Consolidate(await sessions.GetAllByGroupReservationIdAsync(groupId));
        var table = await locations.GetTableByIdAsync(reservation.TableId) ?? throw new ValidationException("Table not found.");
        var menu = (await dishes.GetDishesByLocationIdAsync(table.LocationId)).ToDictionary(d => d.Id);
        if (items.Any(i => !menu.TryGetValue(i.DishId, out var dish) || dish.State != DishState.Available))
            throw new ValidationException("A submitted dish is no longer available at this location.");
        var order = await orders.GetOrderByIdAsync("group-order-" + reservationId, userId)
            ?? await orders.GetOrderByReservationIdAsync(reservationId)
            ?? throw new ValidationException("Order not found. Open the group order page before confirming.");
        if (order.CustomerId != userId || order.Status != OrderStatus.Created)
            throw new ValidationException("The order is already submitted or cannot be changed.");
        order.Dishes = items;
        order.Status = OrderStatus.SubmittedByCustomer;
        var revisionCondition = group.Revision == null ? "attribute_not_exists(revision)" : "revision = :revision";
        var values = new System.Collections.Generic.Dictionary<string, AttributeValue> {
            [":open"] = new() { N = "0" }, [":submitted"] = new() { N = "1" } };
        if (group.Revision != null) values[":revision"] = new() { N = group.Revision.Value.ToString() };
        try
        {
            await client.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = [
                new() { Update = new Update { TableName = ResourceNames.GroupReservationsTableName,
                    Key = new() { ["groupReservationId"] = new() { S = groupId } },
                    UpdateExpression = "SET #status = :submitted",
                    ConditionExpression = "#status = :open AND (" + revisionCondition + ")",
                    ExpressionAttributeNames = new() { ["#status"] = "status" }, ExpressionAttributeValues = values } },
                new() { Put = new Put { TableName = ResourceNames.OrdersTableName, Item = context.ToDocument(order).ToAttributeMap(),
                    ConditionExpression = "attribute_exists(orderId) AND #status = :created",
                    ExpressionAttributeNames = new() { ["#status"] = "status" },
                    ExpressionAttributeValues = new() { [":created"] = new() { N = "0" } } } },
                new() { ConditionCheck = new ConditionCheck { TableName = ResourceNames.ReservationsTableName,
                    Key = new() { ["id"] = new() { S = reservationId } },
                    ConditionExpression = "#status = :reserved AND customerId = :owner",
                    ExpressionAttributeNames = new() { ["#status"] = "status" },
                    ExpressionAttributeValues = new() { [":reserved"] = new() { N = "0" }, [":owner"] = new() { S = userId } } } }
            ] });
        }
        catch (TransactionCanceledException)
        {
            throw new ValidationException("The group changed while confirming. Refresh and check participants before trying again.");
        }
        return new { orderId = order.OrderId, status = "Submitted", items, total = items.Sum(i => i.Quantity * menu[i.DishId].Price) };
    }
}
