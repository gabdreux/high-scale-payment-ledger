import { SQSClient, ReceiveMessageCommand, SendMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { mockClient } from "aws-sdk-client-mock";


const sqsMock = mockClient(SQSClient);


process.env.DLQ_URL = "https://sqs.dlq-url.com";
process.env.MAIN_QUEUE_URL = "https://sqs.main-url.com";


const { handler } = await import('./redrive.js');

describe("Lambda DLQ Redrive Handler", () => {
    
    beforeEach(() => {
        sqsMock.reset();
    });

    it("should move messages from DLQ to the main queue and delete them", async () => {
        sqsMock
            .on(ReceiveMessageCommand)
            .resolvesOnce({
                Messages: [
                    { Body: "msg 1", ReceiptHandle: "handle-1" },
                    { Body: "msg 2", ReceiptHandle: "handle-2" }
                ]
            })
            .resolvesOnce({ Messages: [] });

        sqsMock.on(SendMessageCommand).resolves({});
        sqsMock.on(DeleteMessageCommand).resolves({});

        const result = await handler({});

        expect(result.status).toBe("SUCCESS");
        expect(result.moved).toBe(2);


        expect(sqsMock.commandCalls(SendMessageCommand)[0].args[0].input).toMatchObject({
            QueueUrl: "https://sqs.main-url.com",
            MessageBody: "msg 1"
        });
    });

    it("should return zero if DLQ is empty", async () => {
        sqsMock.on(ReceiveMessageCommand).resolves({ Messages: [] });

        const result = await handler({});

        expect(result.moved).toBe(0);
        expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
    });
});