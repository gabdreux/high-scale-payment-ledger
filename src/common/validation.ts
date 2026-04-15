import { ZodError } from "zod";

export const isZodError = (error: any): error is ZodError => {
    return error?.name === 'ZodError' || Array.isArray(error?.issues);
};


export const formatZodError = (error: ZodError) => {
    const details = error.issues || [];
    return {
        message: "Validation Error",
        errors: details.map(e => ({
            path: e.path,
            message: e.message
        }))
    };
};