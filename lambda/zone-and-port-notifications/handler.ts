import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';

// Types
interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (event: APIGatewayProxyEvent, accessToken: string) => Promise<APIGatewayProxyResult>;
}

// Constants
const NOTIFICATION_API_BASE_URL = 'https://event-notification-service-api.polestar-production.com/notifications/v1';

// Utility functions
const extractAccessToken = (event: APIGatewayProxyEvent): string | null => {
  let accessToken = event.headers['Authorization'] || event.headers['authorization'];
  if (!accessToken && event.headers['access-token']) {
    accessToken = event.headers['access-token'];
  }
  if (accessToken?.startsWith('Bearer ')) {
    return accessToken.slice(7);
  }
  return accessToken || null;
};

const createResponse = (statusCode: number, body: any, headers = {}): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...headers
  },
  body: JSON.stringify(body)
});

const handleError = (error: unknown): APIGatewayProxyResult => {
  console.error('Error in zone and port notifications handler:', error);
  
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return createResponse(
      axiosError.response?.status || 500,
      axiosError.response?.data || { error: 'API request failed' }
    );
  }
  
  return createResponse(500, { error: 'Internal server error' });
};

// Endpoint handlers
const createZoneAndPortNotificationSubscription = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports`;
  const body = JSON.parse(event.body || '{}');

  const response = await axios.post(targetUrl, body, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const responseData = response.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = response.status;
  responseData.meta.status_message = response.statusText;

  return createResponse(response.status, responseData);
};

const updateZoneAndPortNotificationSubscription = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports/${id}`;
  const body = JSON.parse(event.body || '{}');

  const response = await axios.put(targetUrl, body, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const responseData = response.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = response.status;
  responseData.meta.status_message = response.statusText;

  return createResponse(response.status, responseData);
};

const deleteZoneAndPortNotificationSubscription = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports/${id}`;

  const response = await axios.delete(targetUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  return createResponse(response.status, response.data);
};

const getZoneAndPortNotificationSubscriptions = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports`;

  const response = await axios.get(targetUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const responseData = response.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = response.status;
  responseData.meta.status_message = response.statusText;

  return createResponse(response.status, responseData);
};

const getZoneAndPortNotificationSubscription = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports/${id}`;

  const response = await axios.get(targetUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const responseData = response.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = response.status;
  responseData.meta.status_message = response.statusText;

  return createResponse(response.status, responseData);
};

const getZoneAndPortNotifications = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const targetUrl = `${NOTIFICATION_API_BASE_URL}/zones-and-ports/${id}/notifications`;

  const response = await axios.get(targetUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const responseData = response.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = response.status;
  responseData.meta.status_message = response.statusText;

  return createResponse(response.status, responseData);
};

// Route configuration
const endpoints: EndpointConfig[] = [
  {
    method: 'POST',
    path: '/notifications/zones-and-ports',
    handler: createZoneAndPortNotificationSubscription
  },
  {
    method: 'PUT',
    path: '/notifications/zones-and-ports/{id}',
    handler: updateZoneAndPortNotificationSubscription
  },
  {
    method: 'DELETE',
    path: '/notifications/zones-and-ports/{id}',
    handler: deleteZoneAndPortNotificationSubscription
  },
  {
    method: 'GET',
    path: '/notifications/zones-and-ports',
    handler: getZoneAndPortNotificationSubscriptions
  },
  {
    method: 'GET',
    path: '/notifications/zones-and-ports/{id}',
    handler: getZoneAndPortNotificationSubscription
  },
  {
    method: 'GET',
    path: '/notifications/zones-and-ports/{id}/notifications',
    handler: getZoneAndPortNotifications
  }
];

// Main handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const accessToken = extractAccessToken(event);
    if (!accessToken) {
      return createResponse(401, { error: 'Access token is required' });
    }

    const endpoint = endpoints.find(
      e => e.method === event.httpMethod && event.path.match(new RegExp(e.path.replace(/{[^}]+}/g, '[^/]+') + '$'))
    );

    if (!endpoint) {
      return createResponse(404, { error: 'Endpoint not found' });
    }

    return await endpoint.handler(event, accessToken);
  } catch (error) {
    return handleError(error);
  }
};
