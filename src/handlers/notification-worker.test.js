import { jest } from '@jest/globals';

jest.unstable_mockModule("aws-xray-sdk-core", () => {
  return {
    __esModule: true,
    default: {
      captureAWSv3Client: (c) => c,
      captureAsyncFunc: (n, f) => f,
    },
    captureAWSv3Client: (c) => c,
    captureAsyncFunc: (n, f) => f,
  };
});

jest.unstable_mockModule("../lib/clients.js", () => ({
    ddbDocClient: {
        send: jest.fn()
    }
}));


jest.unstable_mockModule("../common/logger.js", () => ({
    logMetric: jest.fn()
}));


const { ddbDocClient } = await import("../lib/clients.js");
const { logMetric } = await import("../common/logger.js");
const { handler } = await import("./notification-worker.js");

describe("Notification Worker - Validation", () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.LEDGER_TABLE = "TestTable";
    });

    it("should process new transaction and record idempotency lock", async () => {
        const event = {
            Records: [{
                body: JSON.stringify({ 
                    idempotencyKey: "idem-001",
                    transactionId: "TX#CONFIRMED",
                    fromAccount: "ACC#123",
                    toAccount: "ACC#456", 
                    amount: 100,
                    type: "TRANSFER",
                    transactionId: "TX#CONFIRMED"
                }),
                messageId: "msg-001"
            }]
        };


        ddbDocClient.send.mockResolvedValueOnce({});

        const result = await handler(event);

        expect(result.batchItemFailures).toHaveLength(0);
        expect(ddbDocClient.send).toHaveBeenCalledTimes(1);

        expect(logMetric).toHaveBeenCalledWith("NotificationSent", 1);
    });

    it("should SKIP processing if idempotency lock already exists (Duplicate)", async () => {
        const event = {
            Records: [{
                body: JSON.stringify({ 
                    idempotencyKey: "idem-002",
                    fromAccount: "ACC#123",
                    toAccount: "ACC#456",
                    amount: 100,
                    transactionId: "TX#DUPLICATE"
                 }),
                messageId: "msg-002"
            }]
        };

        const conditionalError = new Error("Conditional Check Failed");
        conditionalError.name = "ConditionalCheckFailedException";
        ddbDocClient.send.mockRejectedValueOnce(conditionalError);

        const result = await handler(event);

        expect(result.batchItemFailures).toHaveLength(0);
        expect(logMetric).not.toHaveBeenCalledWith("NotificationSent", 1);
    });

    it("should record message failure if DynamoDB fails for infrastructure reasons", async () => {
        const event = {
            Records: [{ 
                body: JSON.stringify({ 
                    idempotencyKey: "idem-003",
                    fromAccount: "ACC#123",
                    toAccount: "ACC#456",
                    amount: 100,
                    transactionId: "TX#DB_FAIL"
                 }),
                messageId: "msg-fail-123" 
            }]
        };

        ddbDocClient.send.mockRejectedValueOnce(new Error("Internal Dynamo Error"));

        const result = await handler(event);

        expect(result.batchItemFailures).toHaveLength(1);
        expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-fail-123");
        expect(logMetric).toHaveBeenCalledWith("NotificationError", 1);
    });
});