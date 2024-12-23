import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

// Initialize DynamoDB client
const dynamodb = new DynamoDB.DocumentClient();
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE!;

// Constants for auto screening
const PTE_POST_TRANSACTION_URL = 'https://api.polestar-production.com/purpletrac/v1/registration';
const PTE_GET_TRANSACTION_URL = 'https://api.polestar-production.com/purpletrac/v1/transaction';
const PTE_USERNAME = process.env.PTE_USERNAME!;
const PTE_API_KEY = process.env.PTE_API_KEY!;
const PTE_TIMEOUT = 300000; // 5 minutes

// Types
interface WebhookNotification {
  subscription_id: string;
  notification: {
    event: {
      event_details: {
        event_timestamp: string;
      };
      vessel_information?: {
        imo?: string;
      };
    };
  };
  custom_reference?: string;
  auto_screening?: any;
}

interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
}

// Utility functions
const createResponse = (statusCode: number, body: any, headers = {}): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...headers
  },
  body: JSON.stringify(body)
});

// Helper function to sleep/wait
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Function to handle auto screening process
const handleAutoScreening = async (imoNumber: string): Promise<any> => {
  const pteUrl = `${PTE_POST_TRANSACTION_URL}?username=${PTE_USERNAME}&api_key=${PTE_API_KEY}`;
  
  // Make initial POST request
  const pteResponse = await axios.post(pteUrl, {
    registered_name: imoNumber,
    custom_reference: "AUTO_SCREENING_PROTOTYPE"
  });

  console.log('AUTO_SCREENING POST request successful, transaction_id:', pteResponse.data.transaction_id);

  // Function to get screening status
  const getScreeningStatus = async (transactionId: string) => {
    const getUrl = `${PTE_GET_TRANSACTION_URL}?id=${transactionId}&username=${PTE_USERNAME}&api_key=${PTE_API_KEY}`;
    const response = await axios.get(getUrl);
    return response.data;
  };

  // Wait initial 5 seconds before first poll
  await sleep(5000);

  // Polling with timeout
  const startTime = Date.now();
  let screeningComplete = false;
  let screeningResult = {
    transaction_id: pteResponse.data.transaction_id,
    overall_severity: 'ERROR' // Default value in case of timeout
  };

  while (!screeningComplete && (Date.now() - startTime) < PTE_TIMEOUT) {
    const statusResponse = await getScreeningStatus(pteResponse.data.transaction_id);
    
    if (statusResponse.objects && statusResponse.objects.length > 0) {
      const screeningStatus = statusResponse.objects[0].screening_status;
      const reportStatus = statusResponse.objects[0].report_generation_complete;
      
      if (screeningStatus !== 'PENDING' && reportStatus) {
        screeningComplete = true;
        screeningResult.overall_severity = statusResponse.objects[0].overall_severity;
        console.log('Screening completed with severity:', screeningResult.overall_severity);
        break;
      }
    }

    // Wait 5 seconds before next poll
    await sleep(5000);
  }

  if (!screeningComplete) {
    console.log('Screening timed out, setting severity to ERROR');
  }

  return screeningResult;
};

// Endpoint handlers
const storeWebhookNotification = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Parse the webhook data
    let data: WebhookNotification;
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    
    if (contentType?.includes('text/plain')) {
      data = JSON.parse(event.body || '');
    } else {
      data = JSON.parse(event.body || '');
    }

    // Check for AUTO_SCREENING in custom_reference
    if (data.custom_reference?.includes('AUTO_SCREENING')) {
      console.log('AUTO_SCREENING detected in custom_reference');
      try {
        const imoNumber = data.notification.event.vessel_information?.imo;
        if (imoNumber) {
          const screeningResult = await handleAutoScreening(imoNumber);
          data = {
            ...data,
            auto_screening: screeningResult
          };
        } else {
          console.error('No IMO number found in vessel information');
        }
      } catch (error) {
        console.error('Error in AUTO_SCREENING process:', error);
        // Continue with storing the notification even if screening fails
      }
    }

    // Generate unique ID and prepare item for DynamoDB
    const id = uuidv4();
    const timestamp = data.notification.event.event_details.event_timestamp;
    
    const item = {
      id,
      timestamp,
      subscription_id: data.subscription_id,
      data: data,
      ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
    };

    // Store in DynamoDB
    await dynamodb.put({
      TableName: NOTIFICATIONS_TABLE,
      Item: item
    }).promise();

    return createResponse(201, {
      success: true,
      id: id,
      message: 'Notification stored successfully'
    });
  } catch (error) {
    console.error('Error storing webhook notification:', error);
    return createResponse(500, {
      success: false,
      error: 'Failed to store notification'
    });
  }
};

const getWebhookNotifications = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const { subscription_ids, timestamp_start, timestamp_end = new Date().toISOString() } = event.queryStringParameters || {};
    
    let items: any[] = [];
    
    if (subscription_ids) {
      // Query using GSI if filtering by subscription_ids
      const subscriptionIdList = subscription_ids.split(',');
      
      // Execute queries for each subscription_id
      const queries = subscriptionIdList.map(subscription_id => 
        dynamodb.query({
          TableName: NOTIFICATIONS_TABLE,
          IndexName: 'subscription-index',
          KeyConditionExpression: 'subscription_id = :sid AND #ts BETWEEN :start AND :end',
          ExpressionAttributeNames: {
            '#ts': 'timestamp'
          },
          ExpressionAttributeValues: {
            ':sid': subscription_id,
            ':start': timestamp_start || '0',
            ':end': timestamp_end
          }
        }).promise()
      );
      
      const results = await Promise.all(queries);
      items = results.flatMap(result => result.Items || []);
    } else if (timestamp_start) {
      // Scan with timestamp filter if only filtering by time
      const result = await dynamodb.scan({
        TableName: NOTIFICATIONS_TABLE,
        FilterExpression: '#ts BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#ts': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':start': timestamp_start,
          ':end': timestamp_end
        }
      }).promise();
      
      items = result.Items || [];
    } else {
      // Get all items if no filters
      const result = await dynamodb.scan({
        TableName: NOTIFICATIONS_TABLE
      }).promise();
      
      items = result.Items || [];
    }

    return createResponse(200, {
      total_count: items.length,
      data: items,
      filters: {
        ...(subscription_ids && { subscription_ids: subscription_ids.split(',') }),
        ...(timestamp_start && { timestamp_start, timestamp_end }),
      },
    });
  } catch (error) {
    console.error('Error retrieving webhook notifications:', error);
    return createResponse(500, {
      success: false,
      error: 'Failed to retrieve notifications'
    });
  }
};

const cleanupWebhookNotifications = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const { delete_all } = event.queryStringParameters || {};
    
    if (delete_all === 'true') {
      // For delete_all, we'll use scan and batch delete
      // Note: This is a simplified version, for large datasets you'd need pagination
      const result = await dynamodb.scan({
        TableName: NOTIFICATIONS_TABLE,
        ProjectionExpression: 'id, #ts',
        ExpressionAttributeNames: {
          '#ts': 'timestamp'
        }
      }).promise();

      if (result.Items && result.Items.length > 0) {
        const deleteRequests = result.Items.map(item => ({
          DeleteRequest: {
            Key: {
              id: item.id,
              timestamp: item.timestamp
            }
          }
        }));

        // Batch delete items (25 at a time as per DynamoDB limits)
        for (let i = 0; i < deleteRequests.length; i += 25) {
          const batch = deleteRequests.slice(i, i + 25);
          await dynamodb.batchWrite({
            RequestItems: {
              [NOTIFICATIONS_TABLE]: batch
            }
          }).promise();
        }

        return createResponse(200, {
          success: true,
          deletedCount: result.Items.length,
          message: `Successfully deleted all notifications (${result.Items.length} records)`
        });
      }
    }

    // If not delete_all, we rely on TTL for cleanup
    return createResponse(200, {
      success: true,
      message: 'Notifications will be automatically cleaned up by TTL after 24 hours'
    });
  } catch (error) {
    console.error('Error cleaning up webhook notifications:', error);
    return createResponse(500, {
      success: false,
      error: 'Failed to cleanup notifications'
    });
  }
};

// Route configuration
const endpoints: EndpointConfig[] = [
  {
    method: 'POST',
    path: '/webhook-notifications',
    handler: storeWebhookNotification
  },
  {
    method: 'GET',
    path: '/webhook-notifications',
    handler: getWebhookNotifications
  },
  {
    method: 'DELETE',
    path: '/webhook-notifications/cleanup',
    handler: cleanupWebhookNotifications
  }
];

// Main handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const endpoint = endpoints.find(
      e => e.method === event.httpMethod && event.path.endsWith(e.path)
    );

    if (!endpoint) {
      return createResponse(404, { error: 'Endpoint not found' });
    }

    return await endpoint.handler(event);
  } catch (error) {
    console.error('Error in webhook notifications handler:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
