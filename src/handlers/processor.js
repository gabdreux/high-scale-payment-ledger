import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { isZodError, formatZodError } from "../common/validation.js";
import { logMetric } from "../common/logger.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// DOMAIN SCHEMA DEFINITION
const PaymentSchema = z.object({
    idempotencyKey: z.string().min(1),
    fromAccount: z.string().startsWith("ACC#"),
    toAccount: z.string().startsWith("ACC#"),
    amount: z.number().positive(),
    type: z.enum(["TRANSFER", "DEPOSIT"]).default("TRANSFER")
});


export const handler = async (event) => {

    const requestId = event.requestContext?.requestId || 'internal';
    console.info(`[${requestId}] Starting payment processing`);

    try {

        const rawBody = JSON.parse(event.body || "{}");
        const { idempotencyKey, fromAccount, toAccount, amount } = PaymentSchema.parse(rawBody);

        logMetric("ValidationSuccess", 1);

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
                        UpdateExpression: "SET balance = if_not_exists(balance, :zero) - :amount",
                        ConditionExpression: "if_not_exists(balance, :zero) >= :amount",
                        ExpressionAttributeValues: { ":amount": amount }
                    }
                },
                // 3. CREDIT: Increase destination account balance
                {
                    Update: {
                        TableName: tableName,
                        Key: { PK: `ACC#${toAccount}`, SK: "METADATA" },
                        UpdateExpression: "SET balance = if_not_exists(balance, :zero) + :amount",
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
        
        logMetric("SuccessfulTransactions", 1);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Transaction successful", idempotencyKey })
        };

    } catch (error) {

        console.error(`[${requestId}] Execution Error:`, error);

        if (isZodError(error)) {
            logMetric("ValidationError", 1);
            return {
                statusCode: 400,
                body: JSON.stringify(formatZodError(error))
            };
        }
        

        if (error instanceof SyntaxError) {
            logMetric("MalformedJSON", 1);
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON format" }) };
        }

        if (error.name === "TransactionCanceledException") {
            logMetric("BusinessLogicError", 1);
            const reasons = error.CancellationReasons;
            const message = reasons?.[0]?.Code === "ConditionalCheckFailed" 
                ? "Duplicate transaction" 
                : "Insufficient funds or account not found";
            
            return { statusCode: 409, body: JSON.stringify({ message, code: error.name }) };
        }

        logMetric("SystemError", 1);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal server error", requestId })
        };
    }
};