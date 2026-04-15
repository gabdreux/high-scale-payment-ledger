import { z } from "zod";

export const PaymentSchema = z.object({
    idempotencyKey: z.string().min(1),
    fromAccount: z.string().startsWith("ACC#"),
    toAccount: z.string().startsWith("ACC#"),
    amount: z.number().int().positive(),
    type: z.enum(["TRANSFER", "DEPOSIT"]).default("TRANSFER"),
    transactionId: z.string().optional(),
    SK: z.string().optional()
});

export type PaymentData = z.infer<typeof PaymentSchema>;