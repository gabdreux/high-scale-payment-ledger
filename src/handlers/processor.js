import { PaymentSchema } from "../domain/schemas.js";
import { LedgerService } from "../services/ledger.service.js";
import { ddbDocClient } from "../lib/clients.js";
import { isZodError, formatZodError } from "../common/validation.js";
import { logMetric } from "../common/logger.js";


const ledgerService = new LedgerService(ddbDocClient, process.env.LEDGER_TABLE);


export const handler = async (event, context) => {
    const requestId = event.requestContext?.requestId || context?.awsRequestId || 'internal';

    try {
        const rawBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
        const validatedData = PaymentSchema.parse(rawBody);

        logMetric("ValidationSuccess", 1);

        await ledgerService.processTransaction(validatedData);
        
        logMetric("SuccessfulTransactions", 1);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Transaction successful", idempotencyKey: validatedData.idempotencyKey })
        };

    } catch (error) {
        return handleError(error, requestId);
    }
};



function handleError(error, requestId) {
  console.error(`[${requestId}] Execution Error:`, error);

  if (isZodError(error)) {
    logMetric("ValidationError", 1);
    return {
      statusCode: 400,
      body: JSON.stringify(formatZodError(error)),
    };
  }

  if (error instanceof SyntaxError) {
    logMetric("MalformedJSON", 1);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON format" }),
    };
  }

  if (error.name === "TransactionCanceledException") {
    logMetric("BusinessLogicError", 1);
    const reasons = error.CancellationReasons;
    const message = (() => {
        if (reasons?.[0]?.Code === "ConditionalCheckFailed") {
            return "Duplicate transaction";
        }
        if (reasons?.[1]?.Code === "ConditionalCheckFailed") {
            return "Insufficient funds or account not found";
        }
        return "Transaction rejected by business logic";
    })();

    return {
      statusCode: 409,
      body: JSON.stringify({ message, code: error.name }),
    };
  }

  logMetric("SystemError", 1);
  return {
    statusCode: 500,
    body: JSON.stringify({ message: "Internal server error", requestId }),
  };
}