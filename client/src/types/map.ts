export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface PermitMarker {
  id: string;
  lat: number;
  lon: number;
  permitType: string;
  address: string;
  issueDate: string | null;
  status: string | null;
  contractor: string | null;
  value: number | null;
  sourceUrl: string;
  isRoofing: boolean;
}

export interface ClusterFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    cluster: boolean;
    cluster_id?: number;
    point_count?: number;
    permit_id?: string;
    permit_type?: string;
    address?: string;
  };
}
