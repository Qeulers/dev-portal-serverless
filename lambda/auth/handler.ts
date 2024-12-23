// lambda/auth/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';
import { getCorsHeaders, createOptionsResponse } from '../utils/cors';

// Define API URLs
const API_URLS = {
  signin: 'https://account-service-api-public.polestar-production.com/v1/signin',
  refreshToken: 'https://account-service-api-public.polestar-production.com/v1/refresh-access-token'
} as const;

export const handler = async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    // Handle OPTIONS requests for CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return createOptionsResponse();
    }

    try {
      // Determine which endpoint to call based on the path
      const isSignin = event.path.endsWith('/signin');
      const targetUrl = isSignin ? API_URLS.signin : API_URLS.refreshToken;
  
      // Get refresh token from headers if it exists
      const refreshToken = event.headers['refresh-token'];
  
      // Make request to target service
      const response = await axios({
        method: event.httpMethod,
        url: targetUrl,
        data: JSON.parse(event.body || '{}'),
        headers: {
          ...(refreshToken && { 'refresh-token': refreshToken })
        }
      });
  
      // Prepare response headers
      const headers: { [key: string]: string } = {
        'Content-Type': 'application/json',
        ...getCorsHeaders()
      };
  
      // Forward tokens if they exist in the response
      if (response.headers['access-token']) {
        headers['Access-Token'] = response.headers['access-token'];
      }
      if (response.headers['refresh-token']) {
        headers['Refresh-Token'] = response.headers['refresh-token'];
      }
  
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify(response.data)
      };
    } catch (error) {
      console.error('Error in auth handler:', error);
      
      // Handle axios error responses
      if (axios.isAxiosError(error) && error.response) {
        return {
          statusCode: error.response.status,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders()
          },
          body: JSON.stringify(error.response.data)
        };
      }
      
      // Handle other errors
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders()
        },
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  };