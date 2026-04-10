import AWSXRay from "aws-xray-sdk-core";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { logMetric } from "../common/logger.js";

const ddbClient = new SNSClient({});
const snsClient = process.env.JEST_WORKER_ID 
    ? ddbClient 
    : AWSXRay.captureAWSv3Client(ddbClient);

    
export const handler = async (event) => {
    const records = event.Records;
    console.log(`Processing ${records.length} records from stream`);

    const publishPromises = records.map(async (record) => {
        if (record.eventName !== "INSERT") return;

        try {
            // Unmarshall
            const transaction = record.dynamodb.NewImage;
            
            const message = {
                transactionId: transaction.SK.S,
                from: transaction.PK.S,
                to: transaction.to.S,
                amount: parseInt(transaction.amount.N),
                timestamp: transaction.timestamp.S,
                type: transaction.type.S
            };

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
        }

    });

    await Promise.all(publishPromises);
    return { status: "done" };
};