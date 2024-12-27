import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync'; // Using sync parser for simpler code
import { Buffer } from 'buffer';
import * as wkt from 'wellknown';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME;
const CSV_KEY = 'data/zones-ports.csv';

interface ZonePortRecord {
    zone_id: string;
    geometry_wkt?: string;
    geometry_geojson?: string | 'error';
    geometry_array?: number[][] | 'error';
    [key: string]: any;
}

// Utility functions for geometry conversion
const wktToGeoJSON = (wktString: string): string | 'error' => {
    try {
        const geojson = wkt.parse(wktString);
        return geojson ? JSON.stringify(geojson) : 'error';
    } catch (error) {
        console.error('Error converting WKT to GeoJSON:', error);
        return 'error';
    }
};

const wktToArray = (wktString: string): number[][] | 'error' => {
    try {
        const geojson = wkt.parse(wktString);
        if (!geojson) return 'error';
        
        // Handle different geometry types
        switch (geojson.type) {
            case 'Polygon':
                return (geojson as any).coordinates[0]; // First ring of coordinates
            case 'MultiPolygon':
                return (geojson as any).coordinates[0][0]; // First polygon, first ring
            case 'Point':
                return [(geojson as any).coordinates];
            case 'LineString':
                return (geojson as any).coordinates;
            default:
                console.warn('Unsupported geometry type:', geojson.type);
                return 'error';
        }
    } catch (error) {
        console.error('Error converting WKT to array:', error);
        return 'error';
    }
};

// In-memory cache of records
let recordsCache: { [key: string]: ZonePortRecord } | null = null;

const loadRecords = async (): Promise<void> => {
    if (recordsCache !== null) {
        console.log('Using cached records');
        return;
    }

    console.log(`Loading CSV from bucket: ${BUCKET_NAME}, key: ${CSV_KEY}`);
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: CSV_KEY,
        });
        
        const response = await s3Client.send(command);
        if (!response.Body) {
            throw new Error('No data in response');
        }

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as any) {
            chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        console.log('Parsing CSV...');
        const records = parse(buffer, {
            columns: true,
            skip_empty_lines: true
        });

        console.log(`Parsed ${records.length} records, building cache...`);
        recordsCache = {};
        records.forEach((record: ZonePortRecord) => {
            if (record.zone_id) {
                recordsCache![record.zone_id] = record;
            }
        });
        console.log('Cache built successfully');

    } catch (error) {
        console.error('Error loading records:', error);
        throw error;
    }
};

export const getRecordById = async (id: string): Promise<ZonePortRecord | null> => {
    console.log(`Getting record for zone_id: ${id}`);
    try {
        await loadRecords();
        
        if (!recordsCache || !(id in recordsCache)) {
            console.log(`No record found for zone_id: ${id}`);
            return null;
        }

        console.log(`Found record for zone_id: ${id}`);
        const record = recordsCache[id];
        
        // Add geometry conversions if WKT is present
        if (record.geometry_wkt) {
            record.geometry_geojson = wktToGeoJSON(record.geometry_wkt);
            record.geometry_array = wktToArray(record.geometry_wkt);
        }

        return record;
    } catch (error) {
        console.error('Error in getRecordById:', error);
        return null;
    }
};

// Helper function to remove geometry_wkt field from a record
const removeGeometryWkt = (record: ZonePortRecord): ZonePortRecord => {
    const { geometry_wkt, ...rest } = record;
    return rest;
};

// Search fields to look for keyword matches
const SEARCH_FIELDS = [
    'name',
    'iso3_code',
    'country_common_name',
    'country_official_name',
    'description',
    'subdivision',
    'subdivision_name',
    'unlocode',
    'wpi_number',
    'zone_type',
    'zone_sub_type'
];

interface SearchResponse {
    meta: {
        keyword: string;
        totalRecords: number;
        totalPorts: number;
        totalZones: number;
    };
    data: {
        ports: ZonePortRecord[];
        zones: ZonePortRecord[];
    };
}

const searchRecords = async (keyword: string): Promise<SearchResponse> => {
    // Ensure records are loaded
    if (!recordsCache) {
        await loadRecords();
    }
    if (!recordsCache) {
        throw new Error('Failed to load records');
    }

    // Convert keyword to lowercase for case-insensitive search
    const searchTerm = keyword.toLowerCase();

    // Filter records based on keyword
    const matchingRecords = Object.values(recordsCache).filter(record => {
        return SEARCH_FIELDS.some(field => {
            const value = record[field];
            return value && value.toString().toLowerCase().includes(searchTerm);
        });
    });

    // Separate records into ports and zones
    const ports: ZonePortRecord[] = [];
    const zones: ZonePortRecord[] = [];

    matchingRecords.forEach(record => {
        if (record.zone_type === 'Ports') {
            ports.push(removeGeometryWkt(record));
        } else {
            zones.push(removeGeometryWkt(record));
        }
    });

    return {
        meta: {
            keyword,
            totalRecords: matchingRecords.length,
            totalPorts: ports.length,
            totalZones: zones.length
        },
        data: {
            ports,
            zones
        }
    };
};

export const search = async (keyword: string): Promise<SearchResponse> => {
    return searchRecords(keyword);
};
