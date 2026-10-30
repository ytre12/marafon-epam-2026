using System.Collections.Generic;
using System.Linq;
using APIHandler.Entities;
using APIHandler.Constants.Orders;
using APIHandler.Exceptions;

namespace APIHandler.Services.GuestSessions;

public static class GroupOrderRules
{
    public static List<OrderItem> Consolidate(IEnumerable<GuestSession> sessions)
    {
        var submitted = sessions.Where(s => s.IsSubmitted).ToArray();
        if (submitted.Length == 0)
            throw new ValidationException("No participants have submitted their carts.");
        var items = submitted.SelectMany(s => s.Dishes).ToArray();
        if (items.Length == 0)
            throw new ValidationException("Submitted carts contain no dishes.");
        if (items.Any(i => string.IsNullOrWhiteSpace(i.DishId) || i.Quantity <= 0))
            throw new ValidationException("Submitted carts contain invalid dishes or quantities.");
        return items.GroupBy(i => i.DishId).Select(g => new OrderItem
        {
            DishId = g.Key,
            Quantity = g.Sum(i => i.Quantity),
            State = OrderItemState.Pending
        }).ToList();
    }
}
