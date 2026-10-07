-- Ceilings have no effect after closure; preserve bids and transaction history.
DELETE FROM "ProxyBid" WHERE "auctionId" IN (SELECT id FROM "Auction" WHERE status <> 'LIVE');
