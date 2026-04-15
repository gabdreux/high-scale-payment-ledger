import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SNSClient } from "@aws-sdk/client-sns";
import AWSXRay from "aws-xray-sdk-core";


const ddbBaseClient = new DynamoDBClient({});
const snsBaseClient = new SNSClient({});


const ddbTraced = AWSXRay.captureAWSv3Client(ddbBaseClient);
const snsTraced = AWSXRay.captureAWSv3Client(snsBaseClient);


export const ddbDocClient = DynamoDBDocumentClient.from(ddbTraced);
export const snsClient = snsTraced as SNSClient;