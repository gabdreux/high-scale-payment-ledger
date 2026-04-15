import { SQSHandler } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../lib/clients.js";
import { logMetric } from "../common/logger.js";
import { PaymentData, PaymentSchema } from "../domain/schemas.js";

export const handler: SQSHandler = async (event) => { 
    console.log(`[NotificationWorker] Received ${event.Records.length} messages from SQS`);

    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
        try {
            const body = JSON.parse(record.body);
            const rawData = body.Message ? JSON.parse(body.Message) : body;

            const result = PaymentSchema.safeParse(rawData);

            if (!result.success) {
                console.error(`[Poison Pill] ID: ${record.messageId} - Invalid format.`);
                batchItemFailures.push({ itemIdentifier: record.messageId });
                continue;
            }

            const data = result.data;
            const txId = data.transactionId || data.SK;

            try {

                await ddbDocClient.send(new PutCommand({
                    TableName: process.env.LEDGER_TABLE,
                    Item: {
                        PK: `NOTIF#${txId}`,
                        SK: "SENT",
                        sentAt: new Date().toISOString(),
                        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
                    },
                    ConditionExpression: "attribute_not_exists(PK)"
                }));
            } catch (error: any) {
                if (error.name === "ConditionalCheckFailedException") {
                    console.log(`[NotificationWorker] Skip: Already sent for ${txId}`);
                    continue;
                }
                throw error;
            }
            
            await simulateNotification(data);
            logMetric("NotificationSent", 1);

        } catch (error) {
            console.error("[NotificationWorker] FAILED to process message:", error);
            logMetric("NotificationError", 1);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }

    }

    return { batchItemFailures };
};

async function simulateNotification(data: PaymentData): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 50));
}