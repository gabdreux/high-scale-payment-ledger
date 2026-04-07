export const logMetric = (name, value, unit = 'Count') => {
    const logEntry = {
        "_aws": {
            "Timestamp": Date.now(),
            "CloudWatchMetrics": [{
                "Namespace": "PaymentProcessor",
                "Dimensions": [["Service"]],
                "Metrics": [{ "Name": name, "Unit": unit }]
            }]
        },
        "Service": "ProcessorService",
        [name]: value,
        "requestId": process.env.AWS_LAMBDA_LOG_STREAM_NAME
    };

    console.log(JSON.stringify(logEntry));
};