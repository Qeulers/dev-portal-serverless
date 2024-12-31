import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import axios from 'axios';

const secretsClient = new SecretsManagerClient({});
const POLESTAR_SECRET_ARN = process.env.POLESTAR_SECRET_ARN;

interface PolestarCredentials {
    username: string;
    api_key: string;
}

interface VesselRecord {
    flag_alpha_2: string;
    flag_code: string;
    image: string | null;
    imo_number: string;
    mmsi: string | null;
    ship_name: string;
    ship_status: string;
    ship_type: string;
}

interface PolestarResponse {
    meta: {
        limit: number;
        next: string | null;
        offset: number;
        previous: string | null;
        total_count: number;
    };
    objects: VesselRecord[];
}

async function getCredentials(): Promise<PolestarCredentials> {
    const command = new GetSecretValueCommand({
        SecretId: POLESTAR_SECRET_ARN,
    });

    const response = await secretsClient.send(command);
    if (!response.SecretString) {
        throw new Error('No secret string found');
    }

    return JSON.parse(response.SecretString);
}

export async function searchVessels(keyword: string): Promise<VesselRecord[]> {
    try {
        const credentials = await getCredentials();
        
        const response = await axios.get<PolestarResponse>(
            'https://api.polestar-production.com/purpletrac/v1/sisship',
            {
                params: {
                    limit: 500,
                    offset: 0,
                    ship_name__istartswith: keyword,
                    username: credentials.username,
                    api_key: credentials.api_key,
                },
            }
        );

        return response.data.objects;
    } catch (error) {
        console.error('Error searching vessels:', error);
        throw error;
    }
}
