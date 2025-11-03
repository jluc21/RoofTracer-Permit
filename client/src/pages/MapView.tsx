import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { PermitMap } from '@/components/PermitMap';
import { FilterBar, type FilterState } from '@/components/FilterBar';
import { PermitDrawer } from '@/components/PermitDrawer';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import type { MapBounds, PermitMarker } from '@/types/map';
import type { Permit } from '@shared/schema';

// Helper to parse URL search params
function parseSearchParams(): {
  filters: FilterState;
  bbox: MapBounds | null;
} {
  const params = new URLSearchParams(window.location.search);
  
  const filters: FilterState = {
    city: params.get('city') || '',
    state: params.get('state') || '',
    dateFrom: params.get('from') || '',
    dateTo: params.get('to') || '',
    roofingOnly: params.get('roofing') === '1',
  };
  
  const bboxParam = params.get('bbox');
  let bbox: MapBounds | null = null;
  if (bboxParam) {
    const [west, south, east, north] = bboxParam.split(',').map(Number);
    if (!isNaN(west) && !isNaN(south) && !isNaN(east) && !isNaN(north)) {
      bbox = { west, south, east, north };
    }
  }
  
  return { filters, bbox };
}

export default function MapView() {
  // Initialize state from URL on mount
  const initialState = useMemo(() => parseSearchParams(), []);
  
  const [filters, setFilters] = useState<FilterState>(initialState.filters);
  const [bounds, setBounds] = useState<MapBounds | null>(initialState.bbox);
  const [selectedPermitId, setSelectedPermitId] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 25;

  // Build query params
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    
    if (bounds) {
      params.set('bbox', `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
    }
    
    if (filters.city) params.set('city', filters.city);
    if (filters.state) params.set('state', filters.state);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.roofingOnly) params.set('roofing_only', 'true');
    
    params.set('limit', String(pageSize));
    params.set('offset', String(currentPage * pageSize));
    
    return params.toString();
  }, [bounds, filters, currentPage]);

  // Fetch permits
  const queryString = buildQueryParams();
  const { data: permitsData, isLoading } = useQuery<{ permits: Permit[]; total: number }>({
    queryKey: [`/api/permits${queryString ? '?' + queryString : ''}`],
    enabled: bounds !== null,
  });

  // Transform permits to markers
  const markers: PermitMarker[] = (permitsData?.permits || []).map((permit) => ({
    id: permit.id,
    lat: permit.lat ? parseFloat(String(permit.lat)) : 0,
    lon: permit.lon ? parseFloat(String(permit.lon)) : 0,
    permitType: permit.permit_type || 'Unknown',
    address: permit.address_raw || 'Address not available',
    issueDate: permit.issue_date || null,
    status: permit.permit_status || null,
    contractor: permit.contractor_name || null,
    value: permit.permit_value ? parseFloat(String(permit.permit_value)) : null,
    sourceUrl: (permit.provenance as any)?.url || '',
    isRoofing: permit.is_roofing === 1,
  }));

  const handleBoundsChange = useCallback((newBounds: MapBounds) => {
    setBounds(newBounds);
    setCurrentPage(0);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(0);
  }, []);

  const handlePermitClick = useCallback((permit: PermitMarker) => {
    setSelectedPermitId(permit.id);
    if (!drawerOpen) {
      setDrawerOpen(true);
    }
  }, [drawerOpen]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Sync URL with filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.city) params.set('city', filters.city);
    if (filters.state) params.set('state', filters.state);
    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.roofingOnly) params.set('roofing', '1');
    if (bounds) {
      params.set('bbox', `${bounds.west.toFixed(4)},${bounds.south.toFixed(4)},${bounds.east.toFixed(4)},${bounds.north.toFixed(4)}`);
    }
    
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [filters, bounds]);

  return (
    <div className="h-screen flex flex-col">
      <FilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalPermits={permitsData?.total || 0}
        isLoading={isLoading}
      />
      
      <div className="flex-1 relative mt-16">
        <PermitMap
          permits={markers}
          onBoundsChange={handleBoundsChange}
          onPermitClick={handlePermitClick}
          selectedPermitId={selectedPermitId}
          isLoading={isLoading}
        />
        
        {drawerOpen && (
          <PermitDrawer
            permits={markers}
            onClose={() => setDrawerOpen(false)}
            onPermitClick={handlePermitClick}
            selectedPermitId={selectedPermitId}
            totalCount={permitsData?.total || 0}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        )}
        
        {!drawerOpen && (
          <Button
            size="icon"
            className="fixed right-4 top-20 z-10 shadow-lg"
            onClick={() => setDrawerOpen(true)}
            data-testid="button-open-drawer"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
