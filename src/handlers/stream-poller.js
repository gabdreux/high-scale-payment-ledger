import { PublishCommand } from "@aws-sdk/client-sns";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { snsClient } from "../lib/clients.js";
import { logMetric } from "../common/logger.js";


export const handler = async (event) => {
    const records = event.Records;
    console.log(`Processing ${records.length} records from stream`);

    const batchItemFailures = [];

    const publishPromises = records.map(async (record) => {

        if (record.eventName !== "INSERT") return;

        try {

            const transaction = unmarshall(record.dynamodb.NewImage);
            

            const message = {
                transactionId: transaction.SK || "N/A",
                from: transaction.PK || "N/A",
                to: transaction.to || "UNKNOWN",
                amount: Number(transaction.amount) || 0,
                timestamp: transaction.timestamp || new Date().toISOString(),
                type: transaction.type || "PAYMENT"
            };

            console.log(`Publishing to SNS: ${message.transactionId}`);

            await snsClient.send(new PublishCommand({
                TopicArn: process.env.SNS_TOPIC_ARN,
                Message: JSON.stringify(message),
                MessageAttributes: {
                    "type": { DataType: "String", StringValue: message.type }
                }
            }));

            logMetric("StreamEventProcessed", 1);
        } catch (error) {
            console.error("Error processing stream record:", error);
            logMetric("StreamProcessingError", 1);

            batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
        }
    });

    await Promise.all(publishPromises);
    return { batchItemFailures };
};