import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { search } from './csvHandler';
import { searchVessels } from './vesselSearch';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Get keyword from query parameters
        const keyword = event.queryStringParameters?.keyword;

        // Validate keyword parameter
        if (!keyword) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Missing required query parameter: keyword'
                })
            };
        }

        // Perform parallel searches
        const [zonePortResult, vessels] = await Promise.all([
            search(keyword),
            searchVessels(keyword)
        ]);

        // Combine results
        const result = {
            meta: {
                ...zonePortResult.meta,
                totalVessels: vessels.length
            },
            data: {
                ...zonePortResult.data,
                vessels
            }
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error in search handler:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error'
            })
        };
    }
};
