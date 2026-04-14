import { SQSClient, ReceiveMessageCommand, SendMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});
const DLQ_URL = process.env.DLQ_URL;
const MAIN_QUEUE_URL = process.env.MAIN_QUEUE_URL;

export const handler = async (event) => {
    console.log("Iniciando Redrive de mensagens da DLQ...");
    let messagesMoved = 0;

    while (true) {

        const receiveRes = await sqsClient.send(new ReceiveMessageCommand({
            QueueUrl: DLQ_URL,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 1
        }));

        if (!receiveRes.Messages || receiveRes.Messages.length === 0) break;

        for (const msg of receiveRes.Messages) {

            await sqsClient.send(new SendMessageCommand({
                QueueUrl: MAIN_QUEUE_URL,
                MessageBody: msg.Body
            }));

            await sqsClient.send(new DeleteMessageCommand({
                QueueUrl: DLQ_URL,
                ReceiptHandle: msg.ReceiptHandle
            }));
            
            messagesMoved++;
        }
    }

    console.log(`Redrive finalizado. Total de mensagens movidas: ${messagesMoved}`);
    return { status: "SUCCESS", moved: messagesMoved };
};