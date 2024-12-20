// lambda/vessel/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

// Define API URL
const VESSEL_API_URL = 'https://asset-info-api.polestar-production.com/vessel-insights/v1/vessel-characteristics';

export const handler = async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const imo = event.pathParameters?.imo;
      if (!imo) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'IMO number is required' })
        };
      }
  
      // Get access token from headers - check both formats
      let accessToken = event.headers['Authorization'] || event.headers['authorization'];
      if (!accessToken && event.headers['access-token']) {
        accessToken = event.headers['access-token'];
      }
  
      if (!accessToken) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Access token is required' })
        };
      }
  
      // If token is in Bearer format, extract the token part
      if (accessToken.startsWith('Bearer ')) {
        accessToken = accessToken.slice(7);
      }
  
      // Make request to vessel characteristics service
      const targetUrl = `${VESSEL_API_URL}/${imo}`;
      const response = await axios.get(targetUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
  
      // Add status information to meta object
      const responseData = response.data;
      if (!responseData.meta) {
        responseData.meta = {};
      }
      responseData.meta.status_code = response.status;
      responseData.meta.status_message = response.statusText;
  
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(responseData)
      };
    } catch (error) {
      console.error('Error in vessel handler:', error);
      
      // Handle axios error responses
      if (axios.isAxiosError(error) && error.response) {
        return {
          statusCode: error.response.status,
          body: JSON.stringify(error.response.data)
        };
      }
  
      // Handle other errors
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  };