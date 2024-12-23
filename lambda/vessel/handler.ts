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
const VESSEL_API_BASE_URL = 'https://asset-info-api.polestar-production.com/vessel-insights/v1';

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
    ...getCorsHeaders(),
    ...headers
  },
  body: JSON.stringify(body)
});

const handleError = (error: unknown): APIGatewayProxyResult => {
  console.error('Error in vessel handler:', error);
  
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
const getVesselCharacteristics = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const response = await axios.get(
    `${VESSEL_API_BASE_URL}/vessel-characteristics/${imo}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );

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
    path: '/vessel-characteristics',
    handler: getVesselCharacteristics
  }
  // Add new endpoints here following the same pattern
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