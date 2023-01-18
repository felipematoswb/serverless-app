import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(client);

const tableName = "blogdb";

export const handler = async (event, context) => {
    let body;
    let statusCode = 200;
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000", // Required for CORS support to work
        "Access-Control-Allow-Credentials": true,
    };

    try {
    switch (event.httpMethod + ' ' + event.resource) {
        case "DELETE /posts/{id}":
            await dynamo.send(
                new DeleteCommand({
                    TableName: tableName,
                    Key: {
                        id: event.pathParameters.id,
                    },
                })
            );
            body = `Deleted item ${event.pathParameters.id}`;
        break;
        case "GET /posts/{id}":
            body = await dynamo.send(
                new GetCommand({
                TableName: tableName,
                    Key: {
                        id: event.pathParameters.id,
                    },
                })
            );
            body = body.Item;
        break;
        case "GET /posts":
            body = await dynamo.send(
                new ScanCommand({ TableName: tableName })
            );
            body = body.Items;
        break;
        case "PUT /posts":
            let requestJSON = JSON.parse(event.body);
            await dynamo.send(
                new PutCommand({
                    TableName: tableName,
                    Item: {
                        id: requestJSON.id,
                        postTitle: requestJSON.postTitle,
                        postDescription: requestJSON.postDescription,
                    },
                })
            );
        body = `Put post ${requestJSON.id}`;
        break;
        default:
        throw new Error(`Unsupported route: "${event.httpMethod + ' ' + event.resource}"`);
    }
    } catch (err) {
        statusCode = 400;
        body = err.message;
    } finally {
        body = JSON.stringify(body);
    }

    return { statusCode, body, headers };
};
