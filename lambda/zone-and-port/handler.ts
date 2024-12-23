import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';
import { getCorsHeaders, createOptionsResponse } from '../utils/cors';

// Types
interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (event: APIGatewayProxyEvent, accessToken: string) => Promise<APIGatewayProxyResult>;
}

// Constants
const ZONE_AND_PORT_API_BASE_URL = 'https://zone-service-api.polestar-production.com/zone-port-insights/v1';

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

const createResponse = (statusCode: number, body: any, headers: any = {}): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...getCorsHeaders(),
    ...headers
  },
  body: JSON.stringify(body)
});

const handleError = (error: unknown): APIGatewayProxyResult => {
  console.error('Error in zone and port handler:', error);
  
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
const getZoneAndPortTraffic = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const queryParams = event.queryStringParameters || {};

  const baseUrl = `${ZONE_AND_PORT_API_BASE_URL}/zone-and-port-traffic/id/:id`;
  const targetUrl = new URL(baseUrl.replace(':id', id) || '');
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined) {
      targetUrl.searchParams.append(key, value);
    }
  });

  const response = await axios.get(targetUrl.toString(), {
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

const getVesselsInZoneOrPort = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id;
  if (!id) {
    return createResponse(400, { error: 'ID is required' });
  }

  const queryParams = event.queryStringParameters || {};

  const baseUrl = `${ZONE_AND_PORT_API_BASE_URL}/vessels-in-zone-or-port/id/:id`;
  const targetUrl = new URL(baseUrl.replace(':id', id) || '');
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined) {
      targetUrl.searchParams.append(key, value);
    }
  });

  const response = await axios.get(targetUrl.toString(), {
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

const getZoneAndPortList = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const queryParams = event.queryStringParameters || {};

  const baseUrl = `${ZONE_AND_PORT_API_BASE_URL}/zones`;
  const targetUrl = new URL(baseUrl);
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined) {
      targetUrl.searchParams.append(key, value);
    }
  });

  const response = await axios.get(targetUrl.toString(), {
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
    method: 'GET',
    path: '/zone-and-port-insights/zone-and-port-traffic/id/',
    handler: getZoneAndPortTraffic
  },
  {
    method: 'GET',
    path: '/zone-and-port-insights/vessels-in-zone-or-port/id/',
    handler: getVesselsInZoneOrPort
  },
  {
    method: 'GET',
    path: '/zone-and-port-insights/zones',
    handler: getZoneAndPortList
  }
];

// Main handler
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle OPTIONS requests for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  try {
    const accessToken = extractAccessToken(event);
    if (!accessToken) {
      return createResponse(401, { error: 'Access token is required' });
    }

    // Find matching endpoint
    const endpoint = endpoints.find(e => 
      e.method === event.httpMethod && 
      event.path.includes(e.path)
    );

    if (!endpoint) {
      return createResponse(404, { error: 'Endpoint not found' });
    }

    return await endpoint.handler(event, accessToken);
  } catch (error) {
    return handleError(error);
  }
};
