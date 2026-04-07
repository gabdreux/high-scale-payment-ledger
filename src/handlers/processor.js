import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {

    const requestId = event.requestContext?.requestId || 'internal';
    console.info(`[${requestId}] Starting payment processing`);

    try {
        if (!event.body) throw new Error("MISSING_BODY");
        
        const { idempotencyKey, fromAccount, toAccount, amount } = JSON.parse(event.body);
        const tableName = process.env.LEDGER_TABLE;

        // BUSINESS VALIDATION
        if (!idempotencyKey || !fromAccount || !toAccount || amount <= 0) {
            console.warn(`[${requestId}] Validation failed: Invalid input parameters`);
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    message: "Invalid input: amount must be positive and all accounts are required" 
                })
            };
        }

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
        console.info(`[${requestId}] Transaction successful: ${idempotencyKey}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Transaction successful", idempotencyKey })
        };

    } catch (error) {

        console.error(`[${requestId}] Execution Error:`, error);

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