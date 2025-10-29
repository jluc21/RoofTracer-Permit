import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RotateCcw, Filter } from 'lucide-react';

export interface FilterState {
  city: string;
  state: string;
  dateFrom: string;
  dateTo: string;
  roofingOnly: boolean;
}

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  totalPermits: number;
  isLoading?: boolean;
}

export function FilterBar({
  filters,
  onFiltersChange,
  totalPermits,
  isLoading = false,
}: FilterBarProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleInputChange = (field: keyof FilterState, value: string | boolean) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      city: '',
      state: '',
      dateFrom: '',
      dateTo: '',
      roofingOnly: false,
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-20 bg-card border-b border-card-border shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold text-foreground">RoofTracer</h1>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-city" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            City
          </Label>
          <Input
            id="filter-city"
            placeholder="e.g. Austin"
            value={localFilters.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-40 text-sm"
            data-testid="input-city"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-state" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            State
          </Label>
          <Input
            id="filter-state"
            placeholder="e.g. TX"
            value={localFilters.state}
            onChange={(e) => handleInputChange('state', e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            maxLength={2}
            className="h-9 w-20 text-sm uppercase"
            data-testid="input-state"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-date-from" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            From
          </Label>
          <Input
            id="filter-date-from"
            type="date"
            value={localFilters.dateFrom}
            onChange={(e) => handleInputChange('dateFrom', e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-36 text-sm"
            data-testid="input-date-from"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-date-to" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            To
          </Label>
          <Input
            id="filter-date-to"
            type="date"
            value={localFilters.dateTo}
            onChange={(e) => handleInputChange('dateTo', e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-36 text-sm"
            data-testid="input-date-to"
          />
        </div>

        <div className="flex items-center gap-2 pl-2">
          <Switch
            id="filter-roofing"
            checked={localFilters.roofingOnly}
            onCheckedChange={(checked) => handleInputChange('roofingOnly', checked)}
            data-testid="switch-roofing-only"
          />
          <Label htmlFor="filter-roofing" className="text-xs font-medium text-foreground cursor-pointer">
            Roofing Only
          </Label>
        </div>

        <Button
          size="sm"
          onClick={handleApply}
          disabled={isLoading}
          className="h-9 ml-2"
          data-testid="button-apply-filters"
        >
          Apply
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          className="h-9"
          data-testid="button-reset-filters"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Reset
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {totalPermits.toLocaleString()} permit{totalPermits !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
