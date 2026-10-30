using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using APIHandler.Constants;
using APIHandler.Entities;
using APIHandler.Exceptions;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace APIHandler.Repositories.GuestSessions;

public class GuestSessionRepository(IDynamoDBContext context, IAmazonDynamoDB client) : IGuestSessionRepository
{
    public async Task<GuestSession?> GetByGuestSessionId(string id)
    {
        var session = await context.LoadAsync<GuestSession?>(id, DynamoConfig.LoadConfig(ResourceNames.GuestSessionTableName));
        if (session != null) session.IsPersisted = true;
        return session;
    }

    public async Task<GuestSession?> GetByGroupReservationId(string groupReservationId) =>
        (await GetAllByGroupReservationIdAsync(groupReservationId)).FirstOrDefault();

    public async Task<GuestSession?> GetByTokenHash(string tokenHash)
    {
        var matches = await context.QueryAsync<GuestSession>(tokenHash, new QueryConfig
        {
            OverrideTableName = ResourceNames.GuestSessionTableName,
            IndexName = GlobalSecondaryIndexes.GuestSession.SessionTokenHash
        }).GetRemainingAsync();
        // Re-read the base item: the token index can temporarily retain a removed guest.
        return matches.Count == 0 ? null : await GetByGuestSessionId(matches[0].Id);
    }

    public async Task<List<GuestSession>> GetAllByGroupReservationIdAsync(string groupReservationId)
    {
        // This small training application uses a consistent base-table scan. A GSI
        // cannot provide a consistent snapshot for final submission or removal.
        var sessions = await context.ScanAsync<GuestSession>([new ScanCondition(nameof(GuestSession.GroupReservationId), ScanOperator.Equal, groupReservationId)],
            new ScanConfig { OverrideTableName = ResourceNames.GuestSessionTableName, ConsistentRead = true }).GetRemainingAsync();
        sessions.ForEach(s => s.IsPersisted = true);
        return sessions;
    }

    public async Task<int> CountByGroupReservationId(string groupReservationId) =>
        (await GetAllByGroupReservationIdAsync(groupReservationId)).Count(s => !s.IsOwnerSession);

    public Task SaveAsync(GuestSession session) => MutateAsync(session, false);
    public Task DeleteAsync(GuestSession session) => MutateAsync(session, true);

    private async Task MutateAsync(GuestSession session, bool delete)
    {
        var previous = session.Revision;
        var condition = !session.IsPersisted ? "attribute_not_exists(guestSessionId)"
            : previous == null ? "attribute_exists(guestSessionId) AND attribute_not_exists(revision)"
            : "attribute_exists(guestSessionId) AND revision = :revision";
        var values = previous == null ? null : new Dictionary<string, AttributeValue>
            { [":revision"] = new() { N = previous.Value.ToString() } };
        session.Revision = (previous ?? 0) + 1;
        var mutation = delete
            ? new TransactWriteItem { Delete = new Delete {
                TableName = ResourceNames.GuestSessionTableName,
                Key = new() { ["guestSessionId"] = new() { S = session.Id } },
                ConditionExpression = condition, ExpressionAttributeValues = values } }
            : new TransactWriteItem { Put = new Put {
                TableName = ResourceNames.GuestSessionTableName,
                Item = context.ToDocument(session).ToAttributeMap(),
                ConditionExpression = condition, ExpressionAttributeValues = values } };
        try
        {
            await client.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = [
                mutation,
                new() { Update = new Update {
                    TableName = ResourceNames.GroupReservationsTableName,
                    Key = new() { ["groupReservationId"] = new() { S = session.GroupReservationId } },
                    UpdateExpression = "ADD revision :one",
                    ConditionExpression = "attribute_exists(groupReservationId) AND #status = :open",
                    ExpressionAttributeNames = new() { ["#status"] = "status" },
                    ExpressionAttributeValues = new() { [":one"] = new() { N = "1" }, [":open"] = new() { N = "0" } }
                } }
            ] });
            session.IsPersisted = !delete;
        }
        catch (TransactionCanceledException)
        {
            session.Revision = previous;
            throw new ValidationException("The cart or group changed. Refresh and try again; submitted groups cannot be edited.");
        }
    }
}
