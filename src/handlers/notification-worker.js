import { logMetric } from "../common/logger.js";


export const handler = async (event) => {

    const records = event.Records;
    console.log(`[NotificationWorker] Received ${records.length} messages from SQS`);

    for (const record of records) {
        try {

            const message = JSON.parse(record.body);
            
            console.log(`[NotificationWorker] Processing transaction: ${message.transactionId}`);
            
            // Simulate sending a notification
            // In a real scenario, call an external API or AWS SES here
            await simulateNotification(message);

            logMetric("NotificationSent", 1);
            
        } catch (error) {

            console.error("[NotificationWorker] Failed to process record:", error);
            logMetric("NotificationError", 1);
            
            throw error; 
        }
    }

    return { batchItemFailures: [] };
};

async function simulateNotification(data) {
    return new Promise((resolve) => setTimeout(resolve, 50));
}