export const isZodError = (error) => {
    return error?.name === 'ZodError' || Array.isArray(error?.issues);
};


export const formatZodError = (error) => {
    const details = error.issues || error.errors || [];
    return {
        message: "Validation Error",
        errors: details.map(e => ({
            path: e.path,
            message: e.message
        }))
    };
};