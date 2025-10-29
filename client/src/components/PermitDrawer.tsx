import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PermitMarker } from '@/types/map';

interface PermitDrawerProps {
  permits: PermitMarker[];
  onClose: () => void;
  onPermitClick: (permit: PermitMarker) => void;
  selectedPermitId?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function PermitDrawer({
  permits,
  onClose,
  onPermitClick,
  selectedPermitId,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  isLoading = false,
}: PermitDrawerProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = currentPage * pageSize + 1;
  const endIndex = Math.min((currentPage + 1) * pageSize, totalCount);

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatValue = (value: number | null) => {
    if (value === null) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="fixed right-0 top-16 bottom-0 w-96 bg-card border-l border-card-border shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-card-border">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">Permits in View</h2>
          <Badge variant="secondary" className="text-xs font-medium">
            {totalCount}
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-8 w-8"
          data-testid="button-close-drawer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Permit List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-card-border">
          {permits.length === 0 && !isLoading && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No permits found in the current view.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Try adjusting the map view or filters.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">Loading permits...</p>
            </div>
          )}

          {permits.map((permit) => (
            <div
              key={permit.id}
              onClick={() => onPermitClick(permit)}
              className={`px-6 py-3 cursor-pointer transition-colors hover-elevate ${
                selectedPermitId === permit.id ? 'bg-accent' : ''
              }`}
              data-testid={`permit-row-${permit.id}`}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground truncate" title={permit.address}>
                  {permit.address || 'Address not available'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={permit.isRoofing ? "default" : "secondary"} className="text-xs">
                    {permit.permitType || 'Unknown'}
                  </Badge>
                  {permit.status && (
                    <Badge variant="outline" className="text-xs">
                      {permit.status}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                  <span>{formatDate(permit.issueDate)}</span>
                  {formatValue(permit.value) && (
                    <span className="font-semibold text-foreground">{formatValue(permit.value)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer - Pagination */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-card-border">
        <span className="text-xs text-muted-foreground">
          {totalCount > 0 ? `${startIndex}-${endIndex} of ${totalCount}` : '0 permits'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 0 || isLoading}
            className="h-8 w-8"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages - 1 || isLoading}
            className="h-8 w-8"
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
