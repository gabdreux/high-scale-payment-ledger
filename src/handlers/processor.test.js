import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

jest.unstable_mockModule('../common/logger.js', () => ({
    logMetric: jest.fn()
}));

const logger = await import('../common/logger.js');
const { handler } = await import('./processor.js');


process.env.LEDGER_TABLE = 'payment-ledger-table-test';
const ddbMock = mockClient(DynamoDBDocumentClient);



describe('Processor Handler - (Zod Validated)', () => {
    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
    });

    it('SUCCESS: should process a valid transfer with ACC# prefix', async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k1', fromAccount: 'ACC#A', toAccount: 'ACC#B', amount: 50 })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(200);
        expect(logger.logMetric).toHaveBeenCalledWith("ValidationSuccess", 1);
        expect(logger.logMetric).toHaveBeenCalledWith("SuccessfulTransactions", 1);
    });

    it('SUCCESS: should process a DEPOSIT from system reserve to user', async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        
        const event = {
            body: JSON.stringify({ 
                idempotencyKey: 'dep-001', 
                fromAccount: 'ACC#SYSTEM_RESERVE',
                toAccount: 'ACC#GABRIEL', 
                amount: 1000,
                type: 'DEPOSIT' 
            })
        };

        const res = await handler(event);
        
        expect(res.statusCode).toBe(200);
        const calls = ddbMock.commandCalls(TransactWriteCommand);
        const params = calls[0].args[0].input.TransactItems;

        expect(params[1].Update.ConditionExpression).toContain("attribute_exists(PK)");
        expect(params[2].Update.UpdateExpression).toContain("if_not_exists(balance, :zero)");
        expect(params[2].Update.ExpressionAttributeValues[":zero"]).toBe(0);
        expect(params[2].Update.ExpressionAttributeValues[":amount"]).toBe(1000);
        expect(params[3].Put.Item.type).toBe("DEPOSIT");
    });

    it('BUSINESS LOGIC: should use if_not_exists to handle new accounts', async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        
        const event = {
            body: JSON.stringify({ 
                idempotencyKey: 'new-acc-test', 
                fromAccount: 'ACC#NEW_SENDER', 
                toAccount: 'ACC#NEW_RECEIVER', 
                amount: 10 
            })
        };

        await handler(event);

        const calls = ddbMock.commandCalls(TransactWriteCommand);
        const params = calls[0].args[0].input.TransactItems;

        expect(params[1].Update.UpdateExpression).toContain("if_not_exists(balance, :zero)");
        expect(params[2].Update.UpdateExpression).toContain("if_not_exists(balance, :zero)");
    });

    it('SCHEMA ERROR: should reject account without ACC# prefix', async () => {
        const event = {
            body: JSON.stringify({ 
                idempotencyKey: 'k1', 
                fromAccount: 'A',
                toAccount: 'ACC#B', 
                amount: 50 
            })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toBe("Validation Error");
    });

    it('SCHEMA ERROR: should reject non-integer amounts', async () => {
        const event = {
            body: JSON.stringify({ 
                idempotencyKey: 'k1', 
                fromAccount: 'ACC#A', toAccount: 'ACC#B', 
                amount: 50.75
            })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        
        const body = JSON.parse(res.body);
        expect(body).toHaveProperty('errors');
    });

    it('BUSINESS ERROR: should reject negative amounts', async () => {
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k2', fromAccount: 'ACC#A', toAccount: 'ACC#B', amount: -100 })
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toContain("Validation Error");
        expect(logger.logMetric).toHaveBeenCalledWith("ValidationError", 1);
    });

    it('CONFLICT: should identify duplicate idempotency key', async () => {
        ddbMock.on(TransactWriteCommand).rejects({
            name: 'TransactionCanceledException',
            CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, {}, {}, {}]
        });
        const event = {
            body: JSON.stringify({ idempotencyKey: 'k1', fromAccount: 'ACC#A', toAccount: 'ACC#B', amount: 50 }),
            requestContext: { requestId: 'test-conflict' }
        };
        const res = await handler(event);
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.body).message).toBe("Duplicate transaction");
        expect(logger.logMetric).toHaveBeenCalledWith("BusinessLogicError", 1);
    });

    it('RUNTIME ERROR: should handle malformed JSON', async () => {
        const event = { body: '{"broken": json}' };
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toBe("Invalid JSON format");
        expect(logger.logMetric).toHaveBeenCalledWith("MalformedJSON", 1);
    });

});