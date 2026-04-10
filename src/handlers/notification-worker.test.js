import { handler } from "./notification-worker.js";

describe("Notification Worker Handler", () => {
    it("should process SQS messages successfully", async () => {
        const event = {
            Records: [
                {
                    body: JSON.stringify({
                        transactionId: "TX#123",
                        amount: 100,
                        type: "TRANSFER"
                    }),
                    messageId: "msg-001"
                }
            ]
        };

        const result = await handler(event);

        expect(result).toHaveProperty("batchItemFailures");
        expect(result.batchItemFailures).toHaveLength(0);
    });

    it("should throw error if message body is invalid JSON", async () => {
        const event = {
            Records: [{ body: "invalid-json", messageId: "msg-002" }]
        };

        await expect(handler(event)).rejects.toThrow();
    });
});