using System.Reflection;
using Amazon;
using Amazon.Runtime;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.Model;
using APIHandler.Constants;
using APIHandler.Constants.Dishes;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Services.GuestSessions;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Locations;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.Auth;
using APIHandler.Repositories.Tables;

foreach (var key in new[] { "ordersTable", "guestSessionTable", "groupReservationsTable", "reservationsTable" })
    Environment.SetEnvironmentVariable(key, key);
var passed = 0;
await Test("consolidates submitted carts, merges dish ids, excludes drafts", () => {
    var result = GroupOrderRules.Consolidate([Session("a", true, 2), Session("b", true, 3), Session("c", false, 90)]);
    Check(result.Count == 1 && result[0].Quantity == 5, "Incorrect consolidation"); return Task.CompletedTask;
});
await Test("no submitted carts rejected", () => Reject<ValidationException>(() => Task.FromResult(GroupOrderRules.Consolidate([Session("a", false, 2)]))));
await Test("empty submitted carts rejected", () => Reject<ValidationException>(() => Task.FromResult(GroupOrderRules.Consolidate([Session("a", true, 0, empty: true)]))));
await Test("invalid quantities rejected", () => Reject<ValidationException>(() => Task.FromResult(GroupOrderRules.Consolidate([Session("a", true, -1)]))));
await Test("DynamoDB serializer uses the expected numeric status and key names", () => {
    using var f = new Fixture();
    Check(f.Context.ToDocument(f.Group).ToAttributeMap()["status"].N == "0", "Group status must be numeric");
    Check(f.Context.ToDocument(f.Reservation).ToAttributeMap()["status"].N == "0", "Reservation status must be numeric");
    Check(f.Context.ToDocument(f.Order!).ToAttributeMap().ContainsKey("orderId"), "Missing order key");
    return Task.CompletedTask;
});
await Test("only owner can load group", async () => { using var f = new Fixture(); await Reject<ActionForbiddenException>(() => f.Owner.GetOwnerAsync("intruder", "r")); Check(f.Transactions.Count == 0, "Unexpected writes"); });
await Test("missing reservation returns not found", async () => { using var f = new Fixture(); f.MissingReservation = true; await Reject<ReservationNotFoundException>(() => f.Owner.GetOwnerAsync("owner", "r")); });
await Test("owner session initialization is idempotent", async () => {
    using var f = new Fixture();
    var a = await f.Owner.GetOwnerAsync("owner", "r"); var b = await f.Owner.GetOwnerAsync("owner", "r");
    Check(a.GuestSessionId == b.GuestSessionId && f.Sessions.Count(s => s.IsOwnerSession) == 1, "Duplicate owner");
});
await Test("new group gets a conditional draft before final submission", async () => {
    using var f = new Fixture(); f.Order = null;
    await f.Owner.GetOwnerAsync("owner", "r");
    Check(f.Draft?.ConditionExpression == "attribute_not_exists(orderId)", "Draft is not conditional");
    Check(f.Draft!.Item["orderId"].S == "group-order-r", "Draft is not deterministic");
});
await Test("final submit atomically writes group and order with revision fence", async () => {
    using var f = new Fixture(); f.Sessions.AddRange([Session("a", true, 2), Session("b", true, 3), Session("c", false, 80)]);
    await f.Owner.SubmitAsync("owner", "g", "r");
    var tx = f.Transactions.Single(); Check(tx.TransactItems.Count == 3, "Missing atomic writes/check");
    Check(tx.TransactItems[0].Update.ConditionExpression.Contains("revision = :revision"), "Missing revision fence");
    var order = f.Context.FromDocument<Order>(Amazon.DynamoDBv2.DocumentModel.Document.FromAttributeMap(tx.TransactItems[1].Put.Item));
    Check(order.Status == OrderStatus.SubmittedByCustomer && order.Dishes.Single().Quantity == 5, "Incorrect final order");
});
await Test("missing order rejected without creating it on submit", async () => { using var f = new Fixture(); f.Order = null; f.Sessions.Add(Session("a", true, 2)); await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "g", "r")); Check(f.Draft == null && f.Transactions.Count == 0, "Submit created an order"); });
await Test("wrong group rejected", async () => { using var f = new Fixture(); await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "other", "r")); });
await Test("repeat submit rejected", async () => { using var f = new Fixture(); f.Group.Status = GroupReservationStatus.Submitted; await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "g", "r")); });
await Test("unavailable dish rejected", async () => { using var f = new Fixture(); f.Dish.State = DishState.OnStop; f.Sessions.Add(Session("a", true, 2)); await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "g", "r")); });
await Test("expired pre-order rejected", async () => { using var f = new Fixture(); f.Reservation.StartTime = DateTime.UtcNow.AddMinutes(20); await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "g", "r")); });
await Test("transaction conflict becomes a recoverable validation error", async () => { using var f = new Fixture(); f.Conflict = true; f.Sessions.Add(Session("a", true, 2)); await Reject<ValidationException>(() => f.Owner.SubmitAsync("owner", "g", "r")); });
await Test("snapshot distinguishes owner and totals all participants", async () => {
    using var f = new Fixture(); var owner = Session("owner-g", true, 2); owner.IsOwnerSession = true; owner.OwnerUserId = "owner";
    f.Sessions.AddRange([owner, Session("guest", false, 3)]);
    var result = await f.Guests.GetSessionsAsync("owner", "g");
    Check(result.Total == 50 && result.Participants.First().Type == APIHandler.Models.GuestSessions.ParticipantType.Owner, "Invalid participant snapshot");
});
await Test("delete returns fresh participants and recalculated total", async () => {
    using var f = new Fixture(); f.Sessions.AddRange([Session("a", true, 2), Session("b", false, 3)]);
    var result = await f.Guests.DeleteGuestSessionAsync("owner", "g", "a");
    Check(result.Total == 30 && result.Participants.Single().Id == "b", "Stale delete response");
});
await Test("owner cannot be removed", async () => {
    using var f = new Fixture(); var owner = Session("owner-g", true, 2); owner.IsOwnerSession = true; f.Sessions.Add(owner);
    await Reject<ValidationException>(() => f.Guests.DeleteGuestSessionAsync("owner", "g", owner.Id));
});
await Test("guest from another group cannot be removed", async () => {
    using var f = new Fixture(); var guest = Session("other", false, 2); guest.GroupReservationId = "other"; f.Sessions.Add(guest);
    await Reject<ValidationException>(() => f.Guests.DeleteGuestSessionAsync("owner", "g", guest.Id));
});
await Test("nonowner cannot remove guest", async () => { using var f = new Fixture(); await Reject<ActionForbiddenException>(() => f.Guests.DeleteGuestSessionAsync("intruder", "g", "a")); });
await Test("submitted group cannot remove guests", async () => { using var f = new Fixture(); f.Group.Status = GroupReservationStatus.Submitted; f.Sessions.Add(Session("a", true, 2)); await Reject<ValidationException>(() => f.Guests.DeleteGuestSessionAsync("owner", "g", "a")); });
await Test("guest count excludes the owner session", async () => {
    using var f = new Fixture(); var owner = Session("owner-g", false, 1); owner.IsOwnerSession = true; f.Sessions.AddRange([owner, Session("a", false, 2)]);
    Check((await f.Guests.GetGroupReservationStatusAsync("g")).CurrentParticipants == 2, "Owner counted twice");
});
await Test("malformed guest bearer token rejected cleanly", async () => { using var f = new Fixture(); Check(!await f.Guests.IsAuthorizedAsync("not-base64!!", "a"), "Malformed token authorized"); });
await Test("guest mutation uses session revision and group-open condition", async () => {
    using var f = new Fixture(); var repo = new GuestSessionRepository(f.Context, f.Client); var session = Session("a", false, 2); session.Revision = 3; session.IsPersisted = true;
    await repo.SaveAsync(session);
    var tx = f.Transactions.Single(); Check(tx.TransactItems[0].Put.ConditionExpression.Contains("attribute_exists(guestSessionId)"), "Deleted sessions could be recreated");
    Check(tx.TransactItems[1].Update.ConditionExpression.Contains("#status = :open"), "Missing group lock");
    Check(!tx.TransactItems[0].Put.Item.ContainsKey("IsPersisted"), "Transient flag persisted");
});
Console.WriteLine($"PASS: {passed} group-order checks. No AWS calls made.");

async Task Test(string name, Func<Task> test) { await test(); passed++; Console.WriteLine("PASS " + name); }
static void Check(bool value, string message) { if (!value) throw new Exception(message); }
static async Task Reject<T>(Func<Task> task) where T : Exception { try { await task(); } catch (T) { return; } throw new Exception("Expected " + typeof(T).Name); }
static GuestSession Session(string id, bool submitted, int quantity, bool empty = false) => new() { Id = id, GuestName = id, GroupReservationId = "g", IsSubmitted = submitted, Dishes = empty ? [] : [new() { DishId = "dish", Quantity = quantity }] };

public class Stub : DispatchProxy
{
    public Func<MethodInfo, object?[]?, object?> InvokeMethod = null!;
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => InvokeMethod(targetMethod!, args);
    public static T Create<T>(Func<MethodInfo, object?[]?, object?> invoke) where T : class { var stub = Create<T, Stub>(); ((Stub)(object)stub).InvokeMethod = invoke; return stub; }
}
public sealed class Fixture : IDisposable
{
    public Reservation Reservation = new() { Id = "r", CustomerId = "owner", TableId = "table", WaiterId = "waiter", StartTime = DateTime.UtcNow.AddDays(1), EndTime = DateTime.UtcNow.AddDays(1).AddHours(2), GuestCount = 5 };
    public GroupReservation Group = new() { GroupReservationId = "g", ReservationId = "r", ReservationToken = "invite", Revision = 7 };
    public Order? Order = new() { OrderId = "group-order-r", CustomerId = "owner", ReservationId = "r", ReservationAddress = "Street", ReservationTime = "Tomorrow", Dishes = [] };
    public Dish Dish = new() { Id = "dish", Name = "Dish", Description = "Food", LocationId = "loc", Price = 10, State = DishState.Available };
    public List<GuestSession> Sessions = [];
    public List<TransactWriteItemsRequest> Transactions = [];
    public PutItemRequest? Draft;
    public bool MissingReservation, Conflict;
    public IDynamoDBContext Context;
    public IAmazonDynamoDB Client;
    public OwnerGroupService Owner;
    public GuestSessionService Guests;
    private readonly AmazonDynamoDBClient serializationClient = new(new BasicAWSCredentials("test", "test"), RegionEndpoint.EUNorth1);
    public Fixture()
    {
        Context = new DynamoDBContextBuilder().WithDynamoDBClient(() => serializationClient).ConfigureContext(c => c.DisableFetchingTableMetadata = true).Build();
        Client = Stub.Create<IAmazonDynamoDB>((m, a) => m.Name switch {
            "TransactWriteItemsAsync" => Transact((TransactWriteItemsRequest)a![0]!),
            "PutItemAsync" => Put((PutItemRequest)a![0]!),
            _ => throw new Exception("Unexpected AWS call: " + m.Name) });
        var reservations = Stub.Create<IReservationRepository>((m,a) => Task.FromResult(MissingReservation ? null : Reservation));
        var groups = Stub.Create<IGroupReservationRepository>((m,a) => Task.FromResult<GroupReservation?>(Group));
        var sessions = Stub.Create<IGuestSessionRepository>((m,a) => m.Name switch {
            "GetAllByGroupReservationIdAsync" => Task.FromResult(Sessions.Where(s => s.GroupReservationId == (string)a![0]!).ToList()),
            "GetByGuestSessionId" => Task.FromResult(Sessions.FirstOrDefault(s => s.Id == (string)a![0]!)),
            "SaveAsync" => Save((GuestSession)a![0]!), "DeleteAsync" => Delete((GuestSession)a![0]!),
            _ => throw new Exception("Unexpected session call: " + m.Name) });
        var orders = Stub.Create<IOrderRepository>((m,a) => Task.FromResult(Order));
        var locations = Stub.Create<ILocationRepository>((m,a) => m.Name == "GetTableByIdAsync"
            ? Task.FromResult<Table?>(new() { Id = "table", LocationId = "loc", TableNumber = 1 })
            : Task.FromResult<Location?>(new() { Id = "loc", Address = "Street", Description = "Restaurant", AverageOccupancy = "0" }));
        var dishes = Stub.Create<IDishRepository>((m,a) => m.Name == "GetDishesByLocationIdAsync" ? Task.FromResult<IEnumerable<Dish>>([Dish]) : Task.FromResult<IEnumerable<Dish>>([Dish]));
        Owner = new(reservations, groups, sessions, orders, locations, dishes, Context, Client);
        Guests = new(groups, sessions, dishes, reservations, Stub.Create<IUserRepository>((m,a) => throw new Exception("Unexpected user call")), Stub.Create<ITableRepository>((m,a) => Task.FromResult<Table?>(new() { Id = "table", LocationId = "loc" })));
    }
    private Task<TransactWriteItemsResponse> Transact(TransactWriteItemsRequest request) { if (Conflict) throw new TransactionCanceledException("Conflict"); Transactions.Add(request); return Task.FromResult(new TransactWriteItemsResponse()); }
    private Task<PutItemResponse> Put(PutItemRequest request) { Draft = request; Order = Context.FromDocument<Order>(Amazon.DynamoDBv2.DocumentModel.Document.FromAttributeMap(request.Item)); return Task.FromResult(new PutItemResponse()); }
    private Task Save(GuestSession session) { Sessions.RemoveAll(s => s.Id == session.Id); Sessions.Add(session); return Task.CompletedTask; }
    private Task Delete(GuestSession session) { Sessions.Remove(session); return Task.CompletedTask; }
    public void Dispose() { Context.Dispose(); serializationClient.Dispose(); }
}
