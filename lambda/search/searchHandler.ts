import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { search } from './csvHandler';
import { searchVessels } from './vesselSearch';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Get keyword and type from query parameters
        const keyword = event.queryStringParameters?.keyword;
        const type = event.queryStringParameters?.type;

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

        // Validate type parameter if provided
        if (type && !['vessels', 'ports', 'zones'].includes(type)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Invalid type parameter. Must be one of: vessels, ports, zones'
                })
            };
        }

        let result;

        // Fetch data based on type parameter
        if (!type || type === 'vessels') {
            const vessels = await searchVessels(keyword);
            if (type === 'vessels') {
                result = {
                    meta: {
                        keyword,
                        totalVessels: vessels.length
                    },
                    data: {
                        vessels
                    }
                };
            } else {
                const zonePortResult = await search(keyword);
                result = {
                    meta: {
                        ...zonePortResult.meta,
                        totalVessels: vessels.length
                    },
                    data: {
                        ...zonePortResult.data,
                        vessels
                    }
                };
            }
        } else {
            // Only fetch ports and zones data
            const zonePortResult = await search(keyword);
            result = {
                meta: {
                    ...zonePortResult.meta
                },
                data: {
                    [(type as 'ports' | 'zones')]: zonePortResult.data[type as 'ports' | 'zones']
                }
            };
        }

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
