import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';
import { getCorsHeaders, createOptionsResponse } from '../utils/cors';

// Constants
const MAX_RECORDS_LIMIT = parseInt(process.env.MAX_RECORDS_LIMIT || '5000', 10);

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
  const getAll = queryParams.get_all === 'true';

  const baseUrl = 'https://zone-service-api.polestar-production.com/voyage-insights/v1/vessel-port-calls/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

      // Append port calls from additional response to initial response
      if (additionalResponse.data?.data?.port_calls) {
        responseData.data.port_calls.push(...additionalResponse.data.data.port_calls);
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

const getVesselZoneAndPortEvents = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const getAll = queryParams.get_all === 'true';

  const baseUrl = 'https://zone-service-api.polestar-production.com/voyage-insights/v1/vessel-zone-and-port-events/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

const getVesselAisReportingGaps = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const getAll = queryParams.get_all === 'true';

  const baseUrl = 'https://gap-reporting-api-public.polestar-production.com/voyage-insights/v1/vessel-ais-reporting-gaps/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

      // Append gaps from additional response to initial response
      if (additionalResponse.data?.data?.gaps) {
        responseData.data.gaps.push(...additionalResponse.data.data.gaps);
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

const getVesselPositionalDiscrepancies = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const getAll = queryParams.get_all === 'true';

  const baseUrl = 'https://ais-spoofing-api-public.polestar-production.com/voyage-insights/v1/vessel-positional-discrepancy/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

      // Append discrepancies from additional response to initial response
      if (additionalResponse.data?.data?.discrepancies) {
        responseData.data.discrepancies.push(...additionalResponse.data.data.discrepancies);
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

const getVesselPortStateControl = async (
  event: APIGatewayProxyEvent,
  accessToken: string
): Promise<APIGatewayProxyResult> => {
  const imo = event.pathParameters?.imo;
  if (!imo) {
    return createResponse(400, { error: 'IMO number is required' });
  }

  const queryParams = event.queryStringParameters || {};
  const getAll = queryParams.get_all === 'true';

  const baseUrl = 'https://psc-insp-service-api-public.polestar-production.com/voyage-insights/v1/vessel-port-state-control/:imo';
  const targetUrl = new URL(baseUrl.replace(':imo', imo));
  
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

      // Append inspections from additional response to initial response
      if (additionalResponse.data?.data?.inspections) {
        responseData.data.inspections.push(...additionalResponse.data.data.inspections);
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
