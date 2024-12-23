// Get the allowed origins from environment variable
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

// Helper function to check if origin is allowed
const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*');
};

// Function to get CORS headers based on the request origin
export const getCorsHeaders = (requestOrigin?: string) => {
  // If no origin in request or origin not allowed, use the first allowed origin
  const origin = requestOrigin && isOriginAllowed(requestOrigin) 
    ? requestOrigin 
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'OPTIONS,POST,PUT,GET,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Token,Refresh-Token,access-token,refresh-token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Access-Token,Refresh-Token,access-token,refresh-token'
  };
};

// Helper function to create OPTIONS response
export const createOptionsResponse = (requestOrigin?: string) => ({
  statusCode: 200,
  headers: {
    ...getCorsHeaders(requestOrigin),
    'Access-Control-Max-Age': '3600'
  },
  body: ''
});
