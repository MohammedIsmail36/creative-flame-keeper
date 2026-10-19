# Architecture rules

- Sales return posting and cancellation are atomic database gateways; they derive journal branches from the destination warehouse, reuse the journal writer, preserve original sale cost for linked returns, and append cancellation stock movements so stock history remains auditable.
- Database integration tests for financial gateways run inside rolled-back transactions so fixtures never remain in company data.
- Financial actions must commit document state, journals, inventory, allocations, numbering, and affected balances in one database transaction; browser-side compensation is not rollback.
- Keep browser calculations for immediate previews only; authoritative financial validation and mutations belong in shared database gateways to avoid duplicated rules and partial commits.