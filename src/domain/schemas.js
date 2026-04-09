import { z } from "zod";

export const PaymentSchema = z.object({
    idempotencyKey: z.string().min(1),
    fromAccount: z.string().startsWith("ACC#"),
    toAccount: z.string().startsWith("ACC#"),
    amount: z.number().int().positive(), // Mudança: Apenas inteiros (centavos)
    type: z.enum(["TRANSFER", "DEPOSIT"]).default("TRANSFER")
});