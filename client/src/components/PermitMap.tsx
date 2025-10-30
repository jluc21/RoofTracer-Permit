import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createRoot } from 'react-dom/client';
import type { MapBounds, PermitMarker } from '@/types/map';
import { PermitPopup } from './PermitPopup';
import { Loader2 } from 'lucide-react';

interface PermitMapProps {
  permits: PermitMarker[];
  onBoundsChange: (bounds: MapBounds) => void;
  onPermitClick: (permit: PermitMarker) => void;
  selectedPermitId?: string;
  isLoading?: boolean;
}

export function PermitMap({
  permits,
  onBoundsChange,
  onPermitClick,
  selectedPermitId,
  isLoading = false,
}: PermitMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [selectedPermit, setSelectedPermit] = useState<PermitMarker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [-98.5795, 39.8283], // Center of US
      zoom: 4,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      'bottom-right'
    );

    map.current.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: 'imperial',
      }),
      'bottom-left'
    );

    // Add empty GeoJSON source for permits (clustering enabled)
    map.current.on('load', () => {
      if (!map.current) return;

      map.current.addSource('permits', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'permits',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6',
            10,
            '#f1f075',
            30,
            '#f28cb1',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            10,
            25,
            30,
            30,
          ],
        },
      });

      // Cluster count labels
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'permits',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Individual points
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'permits',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['get', 'isRoofing'],
            '#2563eb',
            '#64748b',
          ],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Click handler for clusters - zoom in
      map.current.on('click', 'clusters', (e) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: ['clusters'],
        });
        const clusterId = features[0].properties?.cluster_id;
        const source = map.current.getSource('permits') as maplibregl.GeoJSONSource;
        
        if (source && clusterId !== undefined) {
          source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
            if (!map.current) return;
            
            const coordinates = (features[0].geometry as any).coordinates;
            map.current.easeTo({
              center: coordinates,
              zoom: zoom,
            });
          }).catch((err) => {
            console.error('Failed to get cluster expansion zoom:', err);
          });
        }
      });

      // Click handler for individual points - show popup
      map.current.on('click', 'unclustered-point', (e) => {
        if (!e.features || !e.features[0]) return;
        
        const properties = e.features[0].properties;
        if (!properties) return;
        
        const permit = permits.find((p) => p.id === properties.id);
        if (permit) {
          setSelectedPermit(permit);
          onPermitClick(permit);
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
    });

    // Emit bounds change on map move
    map.current.on('moveend', () => {
      if (!map.current) return;
      const bounds = map.current.getBounds();
      onBoundsChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    });

    // Initial bounds emit
    const bounds = map.current.getBounds();
    onBoundsChange({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [onBoundsChange]);

  // Update GeoJSON data when permits change
  useEffect(() => {
    if (!map.current || !map.current.getSource('permits')) return;

    const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: permits
        .filter((p) => p.lat && p.lon)
        .map((permit) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [permit.lon!, permit.lat!],
          },
          properties: {
            id: permit.id,
            permitType: permit.permitType,
            address: permit.address,
            isRoofing: permit.isRoofing,
          },
        })),
    };

    const source = map.current.getSource('permits') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson);
    }
  }, [permits]);

  // Handle selected permit (fly to location)
  useEffect(() => {
    if (!map.current || !selectedPermitId) return;

    const permit = permits.find((p) => p.id === selectedPermitId);
    if (permit && permit.lat && permit.lon) {
      map.current.flyTo({
        center: [permit.lon, permit.lat],
        zoom: 15,
        duration: 1000,
      });
      setSelectedPermit(permit);
    }
  }, [selectedPermitId, permits]);

  // Handle popup
  useEffect(() => {
    if (!map.current) return;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (selectedPermit && selectedPermit.lat && selectedPermit.lon) {
      const popupNode = document.createElement('div');
      popupNode.setAttribute('data-permit-popup', '');
      
      const root = createRoot(popupNode);
      root.render(
        <PermitPopup
          permit={selectedPermit}
          onClose={() => setSelectedPermit(null)}
        />
      );

      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '384px',
      })
        .setLngLat([selectedPermit.lon, selectedPermit.lat])
        .setDOMContent(popupNode)
        .addTo(map.current);

      popupRef.current.on('close', () => {
        setSelectedPermit(null);
      });
    }
  }, [selectedPermit]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" data-testid="map-canvas" />
      
      {isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-card border border-card-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">Loading permits...</span>
          </div>
        </div>
      )}
    </div>
  );
}
