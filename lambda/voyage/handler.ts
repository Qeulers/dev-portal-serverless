import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';

// Types
interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (event: APIGatewayProxyEvent, accessToken: string) => Promise<APIGatewayProxyResult>;
}

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
  console.error('Error in voyage handler:', error);
  
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
const getVesselPortCalls = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const baseUrl = 'https://zone-service-api.polestar-production.com/voyage-insights/v1/vessel-port-calls/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

const getVesselZoneAndPortEvents = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const baseUrl = 'https://zone-service-api.polestar-production.com/voyage-insights/v1/vessel-zone-and-port-events/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

const getVesselAisReportingGaps = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const baseUrl = 'https://gap-reporting-api-public.polestar-production.com/voyage-insights/v1/vessel-ais-reporting-gaps/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

const getVesselPositionalDiscrepancies = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const baseUrl = 'https://ais-spoofing-api-public.polestar-production.com/voyage-insights/v1/vessel-positional-discrepancy/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

const getVesselPortStateControl = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const baseUrl = 'https://psc-insp-service-api-public.polestar-production.com/voyage-insights/v1/vessel-port-state-control/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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
    path: '/voyage-insights/vessel-port-calls/',
    handler: getVesselPortCalls
  },
  {
    method: 'GET',
    path: '/voyage-insights/vessel-zone-and-port-events/',
    handler: getVesselZoneAndPortEvents
  },
  {
    method: 'GET',
    path: '/voyage-insights/vessel-ais-reporting-gaps/',
    handler: getVesselAisReportingGaps
  },
  {
    method: 'GET',
    path: '/voyage-insights/vessel-positional-discrepancies/',
    handler: getVesselPositionalDiscrepancies
  },
  {
    method: 'GET',
    path: '/voyage-insights/vessel-port-state-control/',
    handler: getVesselPortStateControl
  }
];

// Main handler
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
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
