using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GuestSessions;
using APIHandler.Services.GuestSessions;
using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GuestSessions;

public class OwnerGroupHandler(OwnerGroupService owners, IGuestSessionService guests) : IApiRequestHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (string.IsNullOrWhiteSpace(userId)) return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        try
        {
            request.TryGetPathValue("reservationId", out var reservationId);
            request.TryGetPathValue("groupReservationId", out var groupId);
            object result;
            if (request.HttpMethod == "GET" && !string.IsNullOrEmpty(groupId))
                result = await guests.GetSessionsAsync(userId, groupId);
            else if (request.HttpMethod == "POST" && !string.IsNullOrEmpty(groupId))
            {
                var body = JsonSerializer.Deserialize<SubmitRequest>(request.Body ?? "{}", JsonOptions);
                if (string.IsNullOrWhiteSpace(body?.ReservationId)) throw new ValidationException("reservationId is required.");
                result = await owners.SubmitAsync(userId, groupId, body.ReservationId);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(reservationId)) throw new ValidationException("reservationId is required.");
                var owner = await owners.GetOwnerAsync(userId, reservationId);
                if (request.HttpMethod == "GET" && request.Path.EndsWith("/guest-session-id")) result = owner;
                else if (request.HttpMethod == "GET" && request.Path.EndsWith("/menu"))
                    result = await guests.GetGuestMenuAsync(owner.GuestSessionId);
                else
                {
                    if (!owner.CanEdit) throw new ValidationException("This group can no longer be edited.");
                    if (request.Path.EndsWith("/submit")) await guests.SubmitCartAsync(owner.GuestSessionId);
                    else
                    {
                        var body = JsonSerializer.Deserialize<UpdateGuestSessionDishRequest>(request.Body ?? "{}", JsonOptions);
                        if (body == null || string.IsNullOrWhiteSpace(body.DishId) || body.Quantity <= 0)
                            throw new ValidationException("dishId and a positive quantity are required.");
                        if (request.HttpMethod == "POST") await guests.AddDishAsync(owner.GuestSessionId, body.DishId, body.Quantity);
                        else await guests.RemoveDishAsync(owner.GuestSessionId, body.DishId, body.Quantity);
                    }
                    result = await guests.GetSessionsAsync(userId, owner.GroupReservationId);
                }
            }
            return ResponseBuilder.CreateJsonResponse(200, result);
        }
        catch (Exception ex) when (ex is ReservationNotFoundException or GroupReservationNotFoundException or GuestSessionNotFoundException)
        { return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger); }
        catch (ActionForbiddenException ex) { return ResponseBuilder.CreateErrorResponse(403, ex.Message, context.Logger); }
        catch (ValidationException ex) { return ResponseBuilder.CreateErrorResponse(400, ex.Message, context.Logger); }
        catch (JsonException) { return ResponseBuilder.CreateErrorResponse(400, "Invalid JSON request body.", context.Logger); }
    }
    private record SubmitRequest(string ReservationId);
}
