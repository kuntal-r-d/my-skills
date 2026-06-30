-- Copy existing investment holdings into the momentum trading portfolio (one-time backfill).
INSERT INTO portfolio_positions (account_id, ticker_id, purpose, qty, avg_cost, sector, stop_level, target_level)
SELECT account_id, ticker_id, 'trading', qty, avg_cost, sector, stop_level, target_level
FROM portfolio_positions
WHERE purpose = 'investment'
ON CONFLICT DO NOTHING;
