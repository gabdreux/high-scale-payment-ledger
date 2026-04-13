
import { handler } from "./stream-poller.js";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { mockClient } from "aws-sdk-client-mock";

const snsMock = mockClient(SNSClient);

describe("Stream Poller Handler", () => {
    
    beforeEach(() => {
        snsMock.reset();
        process.env.SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:MyTopic";
    });

    it("should parse DynamoDB records and publish to SNS", async () => {
        const event = {
            Records: [
                {
                    eventName: "INSERT",
                    dynamodb: {
                        NewImage: {
                            PK: { S: "ACC#123" },
                            SK: { S: "TX#999" },
                            to: { S: "ACC#456" },
                            amount: { N: "100" },
                            timestamp: { S: "2026-01-01T00:00:00Z" },
                            type: { S: "TRANSFER" }
                        }
                    }
                }
            ]
        };

        snsMock.on(PublishCommand).resolves({ MessageId: "123" });

        const result = await handler(event);

        expect(result.batchItemFailures).toHaveLength(0);
        expect(snsMock.calls()).toHaveLength(1);
        
        const sentMessage = JSON.parse(snsMock.call(0).args[0].input.Message);
        expect(sentMessage.transactionId).toBe("TX#999");
        expect(sentMessage.amount).toBe(100);
    });

    it("should ignore non-INSERT events", async () => {
        const event = {
            Records: [{ eventName: "REMOVE" }]
        };

        await handler(event);
        expect(snsMock.calls()).toHaveLength(0);
    });
});