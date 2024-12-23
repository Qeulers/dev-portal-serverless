import { DynamoDBStreamEvent } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { GraphQLClient } from 'graphql-request';

const APPSYNC_API_ENDPOINT = process.env.APPSYNC_API_ENDPOINT!;
const APPSYNC_API_KEY = process.env.APPSYNC_API_KEY!;

// Define the notification interface
interface NotificationInput {
  subscription_id: string;
  message: string;
  type: string;
  timestamp: string;
}

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const notification = unmarshall(record.dynamodb!.NewImage! as Record<string, any>) as NotificationInput;
      
      // Construct GraphQL mutation
      const mutation = `
        mutation PublishNotification($input: CreateNotificationInput!) {
          createNotification(input: $input) {
            id
            subscription_id
            message
            type
            timestamp
          }
        }
      `;

      try {
        const graphQLClient = new GraphQLClient(APPSYNC_API_ENDPOINT, {
          headers: {
            'x-api-key': APPSYNC_API_KEY,
          },
        });

        await graphQLClient.request(mutation, {
          input: notification
        });
      } catch (error) {
        console.error('Error publishing to AppSync:', error);
      }
    }
  }
};
