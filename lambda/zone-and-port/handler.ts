import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';
import { getCorsHeaders, createOptionsResponse } from '../utils/cors';
import { getRecordById } from './csvHandler';

// Types
interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (event: APIGatewayProxyEvent, accessToken: string) => Promise<APIGatewayProxyResult>;
  requiresAuth: boolean;
}

// Constants
const ZONE_AND_PORT_API_BASE_URL = 'https://zone-service-api.polestar-production.com/zone-port-insights/v1';
const MAX_RECORDS_LIMIT = parseInt(process.env.MAX_RECORDS_LIMIT || '5000', 10);

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
  const getAll = queryParams.get_all === 'true';
  
  const baseUrl = `${ZONE_AND_PORT_API_BASE_URL}/zone-and-port-traffic/id/:id`;
  const targetUrl = new URL(baseUrl.replace(':id', id) || '');
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && key !== 'get_all') {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Make initial API call
  const initialResponse = await axios.get(targetUrl.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  let responseData = initialResponse.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = initialResponse.status;
  responseData.meta.status_message = initialResponse.statusText;

  // If get_all is false or no pagination info, return initial response
  if (!getAll || !responseData.meta.total_count || !responseData.meta.limit) {
    return createResponse(initialResponse.status, responseData);
  }

  const totalCount = responseData.meta.total_count;
  const limit = responseData.meta.limit;

  // Check if total count exceeds maximum limit
  if (totalCount > MAX_RECORDS_LIMIT) {
    return createResponse(413, {
      error: "Request exceeds maximum record limit",
      message: `The total number of records (${totalCount}) exceeds the maximum limit of ${MAX_RECORDS_LIMIT}. Please refine your query parameters to return fewer results.`
    });
  }

  // If total count is less than or equal to limit, return initial response
  if (totalCount <= limit) {
    return createResponse(initialResponse.status, responseData);
  }

  // Calculate number of additional requests needed
  const totalRequests = Math.ceil(totalCount / limit);
  const remainingRequests = totalRequests - 1; // Subtract 1 for initial request

  try {
    // Make additional API calls
    for (let i = 1; i <= remainingRequests; i++) {
      const offset = i * limit;
      targetUrl.searchParams.set('offset', offset.toString());

      const additionalResponse = await axios.get(targetUrl.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Append events from additional response to initial response
      if (additionalResponse.data?.data?.events) {
        responseData.data.events.push(...additionalResponse.data.data.events);
      }
    }

    return createResponse(initialResponse.status, responseData);
  } catch (error) {
    if (error instanceof AxiosError) {
      return createResponse(error.response?.status || 500, {
        error: "Error fetching additional records",
        message: error.message
      });
    }
    return createResponse(500, {
      error: "Internal server error",
      message: "An unexpected error occurred while fetching additional records"
    });
  }
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
  const getAll = queryParams.get_all === 'true';

  const baseUrl = `${ZONE_AND_PORT_API_BASE_URL}/vessels-in-zone-or-port/id/:id`;
  const targetUrl = new URL(baseUrl.replace(':id', id) || '');
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && key !== 'get_all') {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Make initial API call
  const initialResponse = await axios.get(targetUrl.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  let responseData = initialResponse.data;
  if (!responseData.meta) {
    responseData.meta = {};
  }
  responseData.meta.status_code = initialResponse.status;
  responseData.meta.status_message = initialResponse.statusText;

  // If get_all is false or no pagination info, return initial response
  if (!getAll || !responseData.meta.total_count || !responseData.meta.limit) {
    return createResponse(initialResponse.status, responseData);
  }

  const totalCount = responseData.meta.total_count;
  const limit = responseData.meta.limit;

  // Check if total count exceeds maximum limit
  if (totalCount > MAX_RECORDS_LIMIT) {
    return createResponse(413, {
      error: "Request exceeds maximum record limit",
      message: `The total number of records (${totalCount}) exceeds the maximum limit of ${MAX_RECORDS_LIMIT}. Please refine your query parameters to return fewer results.`
    });
  }

  // If total count is less than or equal to limit, return initial response
  if (totalCount <= limit) {
    return createResponse(initialResponse.status, responseData);
  }

  // Calculate number of additional requests needed
  const totalRequests = Math.ceil(totalCount / limit);
  const remainingRequests = totalRequests - 1; // Subtract 1 for initial request

  try {
    // Make additional API calls
    for (let i = 1; i <= remainingRequests; i++) {
      const offset = i * limit;
      targetUrl.searchParams.set('offset', offset.toString());

      const additionalResponse = await axios.get(targetUrl.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Append vessels from additional response to initial response
      if (additionalResponse.data?.data?.vessels) {
        responseData.data.vessels.push(...additionalResponse.data.data.vessels);
      }
    }

    return createResponse(initialResponse.status, responseData);
  } catch (error) {
    if (error instanceof AxiosError) {
      return createResponse(error.response?.status || 500, {
        error: "Error fetching additional records",
        message: error.message
      });
    }
    return createResponse(500, {
      error: "Internal server error",
      message: "An unexpected error occurred while fetching additional records"
    });
  }
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

const getZonePortById = async (
  event: APIGatewayProxyEvent,
  _accessToken: string
): Promise<APIGatewayProxyResult> => {
  try {
    const id = event.pathParameters?.id;
    if (!id) {
      return createResponse(400, { error: 'ID is required' });
    }

    const record = await getRecordById(id);
    if (!record) {
      return createResponse(404, { error: 'Record not found' });
    }

    return createResponse(200, record);
  } catch (error) {
    return handleError(error);
  }
};

// Route configuration
const endpoints: EndpointConfig[] = [
  {
    method: 'GET',
    path: '/zones/{id}',
    handler: getZonePortById,
    requiresAuth: false
  },
  {
    method: 'GET',
    path: '/zone-and-port-insights/zone-and-port-traffic/id/{id}',
    handler: getZoneAndPortTraffic,
    requiresAuth: true
  },
  {
    method: 'GET',
    path: '/zone-and-port-insights/vessels-in-zone-or-port/id/{id}',
    handler: getVesselsInZoneOrPort,
    requiresAuth: true
  },
  {
    method: 'GET',
    path: '/zone-and-port-insights/zones',
    handler: getZoneAndPortList,
    requiresAuth: true
  }
];

// Main handler
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Handle OPTIONS requests for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  try {
    // Find matching endpoint using path parameters
    const endpoint = endpoints.find(e => {
      if (e.method !== event.httpMethod) return false;
      
      // Convert endpoint path pattern to regex
      const pathPattern = e.path.replace(/{[^/]+}/g, '[^/]+');
      const pathRegex = new RegExp(`^${pathPattern}$`);
      
      const matches = pathRegex.test(event.path);
      console.log(`Testing path "${event.path}" against pattern "${pathPattern}": ${matches}`);
      return matches;
    });

    if (!endpoint) {
      console.log('No endpoint found for path:', event.path);
      return createResponse(404, { error: 'Endpoint not found' });
    }

    console.log('Found matching endpoint:', endpoint.path);

    // Check if endpoint requires authentication
    if (endpoint.requiresAuth) {
      const accessToken = extractAccessToken(event);
      if (!accessToken) {
        return createResponse(401, { error: 'Access token is required' });
      }
      return await endpoint.handler(event, accessToken);
    }

    // For endpoints that don't require auth
    return await endpoint.handler(event, '');
  } catch (error) {
    console.error('Error in handler:', error);
    return handleError(error);
  }
};
