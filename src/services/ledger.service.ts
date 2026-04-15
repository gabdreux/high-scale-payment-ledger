import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PaymentData } from "../domain/schemas.js";


export class LedgerService {
    private docClient: DynamoDBDocumentClient;
    private tableName: string;

    constructor(docClient: DynamoDBDocumentClient, tableName: string) {
        this.docClient = docClient;
        this.tableName = tableName || '';
    }

    async processTransaction(paymentData: PaymentData): Promise<any> {
        const { idempotencyKey, fromAccount, toAccount, amount, type } = paymentData;
        const now = new Date().toISOString();

        const command = new TransactWriteCommand({
            TransactItems: [
                // 1. IDEMPOTENCY LOCK
                {
                    Put: {
                        TableName: this.tableName,
                        Item: {
                            PK: `IDEM#${idempotencyKey}`,
                            SK: `IDEM#${idempotencyKey}`,
                            createdAt: now,
                            ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h TTL for automatic cleanup
                        },
                        ConditionExpression: "attribute_not_exists(PK)"
                    }
                },
                // 2. DEBIT: Withdraw funds only if balance is sufficient
                {
                    Update: {
                        TableName: this.tableName,
                        Key: { PK: `${fromAccount}`, SK: "METADATA" },
                        UpdateExpression: "SET balance = if_not_exists(balance, :zero) - :amount",
                        ConditionExpression: type === "DEPOSIT" 
                            ? "attribute_exists(PK) OR attribute_not_exists(PK)" 
                            : "balance >= :amount",
                        ExpressionAttributeValues: { 
                            ":amount": amount, 
                            ":zero": 0 
                        }
                    }
                },
                // 3. CREDIT: Increase destination account balance
                {
                    Update: {
                        TableName: this.tableName,
                        Key: { PK: `${toAccount}`, SK: "METADATA" },
                        UpdateExpression: "SET balance = if_not_exists(balance, :zero) + :amount",
                        ExpressionAttributeValues: { 
                            ":amount": amount, 
                            ":zero": 0 
                        }
                    }
                },
                // 4. LEDGER LOG: Immutable audit trail record
                {
                    Put: {
                        TableName: this.tableName,
                        Item: {
                            PK: `${fromAccount}`,
                            SK: `TX#${Date.now()}#${idempotencyKey}`,
                            type: type,
                            to: toAccount,
                            amount: amount,
                            status: "SUCCESS",
                            timestamp: now
                        }
                    }
                }
            ]
        });

        return await this.docClient.send(command);
    }
}