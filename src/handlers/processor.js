import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// DOMAIN SCHEMA DEFINITION
const PaymentSchema = z.object({
    idempotencyKey: z.string().min(1),
    fromAccount: z.string().startsWith("ACC#"),
    toAccount: z.string().startsWith("ACC#"),
    amount: z.number().positive()
});


export const handler = async (event) => {

    const requestId = event.requestContext?.requestId || 'internal';
    console.info(`[${requestId}] Starting payment processing`);

    try {

        const rawBody = JSON.parse(event.body || "{}");
        const { idempotencyKey, fromAccount, toAccount, amount } = PaymentSchema.parse(rawBody);
        const tableName = process.env.LEDGER_TABLE;


        const command = new TransactWriteCommand({
            TransactItems: [
                // 1. IDEMPOTENCY LOCK
                {
                    Put: {
                        TableName: tableName,
                        Item: {
                            PK: `IDEM#${idempotencyKey}`,
                            SK: `IDEM#${idempotencyKey}`,
                            createdAt: new Date().toISOString(),
                            ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h TTL for automatic cleanup
                        },
                        ConditionExpression: "attribute_not_exists(PK)"
                    }
                },
                // 2. DEBIT: Withdraw funds only if balance is sufficient
                {
                    Update: {
                        TableName: tableName,
                        Key: { PK: `ACC#${fromAccount}`, SK: "METADATA" },
                        UpdateExpression: "SET balance = balance - :amount",
                        ConditionExpression: "balance >= :amount",
                        ExpressionAttributeValues: { ":amount": amount }
                    }
                },
                // 3. CREDIT: Increase destination account balance
                {
                    Update: {
                        TableName: tableName,
                        Key: { PK: `ACC#${toAccount}`, SK: "METADATA" },
                        UpdateExpression: "SET balance = balance + :amount",
                        ExpressionAttributeValues: { ":amount": amount }
                    }
                },
                // 4. LEDGER LOG: Immutable audit trail record
                {
                    Put: {
                        TableName: tableName,
                        Item: {
                            PK: `ACC#${fromAccount}`,
                            SK: `TX#${Date.now()}#${idempotencyKey}`,
                            type: "TRANSFER",
                            to: toAccount,
                            amount: amount,
                            status: "SUCCESS",
                            timestamp: new Date().toISOString()
                        }
                    }
                }
            ]
        });

        await docClient.send(command);
        
        // EMBEDDED METRIC FORMAT
        console.info(JSON.stringify({
            _aws: {
                Timestamp: Date.now(),
                CloudWatchMetrics: [{
                    Namespace: "LedgerEngine",
                    Dimensions: [["Currency"]],
                    Metrics: [{ Name: "SuccessfulTransactions", Unit: "Count" }]
                }]
            },
            Currency: "USD",
            SuccessfulTransactions: 1,
            requestId
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Transaction successful", idempotencyKey })
        };

    } catch (error) {

        console.error(`[${requestId}] Execution Error:`, error);

        if (error.name === "ZodError" || error.issues) {
            const details = error.issues || error.errors || [];
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Validation Error",
                    errors: details.map((e) => ({
                        path: e.path,
                        message: e.message,
                    })),
                }),
            };
        }
        

        if (error instanceof SyntaxError) {
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON format" }) };
        }

        if (error.name === "TransactionCanceledException") {
            const reasons = error.CancellationReasons;
            const message = reasons?.[0]?.Code === "ConditionalCheckFailed" 
                ? "Duplicate transaction" 
                : "Insufficient funds or account not found";
            
            return { statusCode: 409, body: JSON.stringify({ message, code: error.name }) };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal server error", requestId })
        };
    }
};