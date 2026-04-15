type MetricUnit = 'Seconds' | 'Microseconds' | 'Milliseconds' | 'Bytes' | 'Kilobytes' | 'Megabytes' | 'Gigabytes' | 'Terabytes' | 'Bits' | 'Kilobits' | 'Megabits' | 'Gigabits' | 'Terabits' | 'Percent' | 'Count' | 'Bytes/Second' | 'Kilobytes/Second' | 'Megabytes/Second' | 'Gigabytes/Second' | 'Terabytes/Second' | 'Bits/Second' | 'Kilobits/Second' | 'Megabits/Second' | 'Gigabits/Second' | 'Terabits/Second' | 'Count/Second' | 'None';

export const logMetric = (name: string, value: number, unit: MetricUnit = 'Count') => {
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