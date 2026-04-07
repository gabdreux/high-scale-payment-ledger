import { handler } from './processor.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

process.env.LEDGER_TABLE = 'payment-ledger-table-test';
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Processor Handler - Enterprise Suite', () => {
    beforeEach(() => ddbMock.reset());

    it('SUCCESS: should process a valid transfer', async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k1', fromAccount: 'A', toAccount: 'B', amount: 50 })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(200);
    });

    it('BUSINESS ERROR: should reject negative amounts', async () => {
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k2', fromAccount: 'A', toAccount: 'B', amount: -100 })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toContain("amount must be positive");
    });

    it('CONFLICT: should identify duplicate idempotency key', async () => {
        ddbMock.on(TransactWriteCommand).rejects({
            name: 'TransactionCanceledException',
            CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, {}, {}, {}]
        });
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k1', fromAccount: 'A', toAccount: 'B', amount: 50 })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.body).message).toBe("Duplicate transaction");
    });

    it('RUNTIME ERROR: should handle malformed JSON', async () => {
        const event = { body: '{"broken": json}' };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toBe("Invalid JSON format");
    });
});