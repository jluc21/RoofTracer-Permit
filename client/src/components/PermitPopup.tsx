import { X, ExternalLink, Calendar, MapPin, User, Hammer, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PermitMarker } from '@/types/map';

interface PermitPopupProps {
  permit: PermitMarker;
  onClose: () => void;
}

export function PermitPopup({ permit, onClose }: PermitPopupProps) {
  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatValue = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-popover rounded-lg border border-popover-border shadow-xl max-w-sm" data-testid="permit-popup">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={permit.isRoofing ? "default" : "secondary"} className="text-xs font-semibold">
              {permit.permitType || 'Unknown Type'}
            </Badge>
            {permit.status && (
              <Badge variant="outline" className="text-xs">
                {permit.status}
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-6 w-6 -mt-1 -mr-1"
            data-testid="button-close-popup"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium text-popover-foreground">
              {permit.address || 'Address not available'}
            </p>
          </div>

          {permit.issueDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>Issued: {formatDate(permit.issueDate)}</span>
            </div>
          )}

          {permit.contractor && (
            <div className="flex items-center gap-2 text-xs">
              <Hammer className="w-3 h-3 text-muted-foreground" />
              <span className="text-popover-foreground truncate" title={permit.contractor}>
                {permit.contractor}
              </span>
            </div>
          )}

          {permit.value !== null && (
            <div className="flex items-center gap-2 text-xs">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm font-semibold text-popover-foreground">
                {formatValue(permit.value)}
              </span>
            </div>
          )}
        </div>

        {permit.sourceUrl && (
          <div className="pt-3 mt-3 border-t border-popover-border">
            <a
              href={permit.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
              data-testid="link-source"
            >
              Open in source portal
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
