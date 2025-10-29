import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Pause, RefreshCw, Settings } from 'lucide-react';
import type { Source, SourceState } from '@shared/schema';

interface SourceCardProps {
  source: Source;
  state?: SourceState;
  onTriggerIngest: (sourceId: number, mode: 'backfill' | 'incremental') => void;
  onToggleEnabled: (sourceId: number, enabled: boolean) => void;
  isLoading?: boolean;
}

export function SourceCard({
  source,
  state,
  onTriggerIngest,
  onToggleEnabled,
  isLoading = false,
}: SourceCardProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPlatformColor = (platform: string): "default" | "secondary" | "outline" => {
    if (platform === 'socrata' || platform === 'arcgis') return 'default';
    return 'secondary';
  };

  return (
    <Card className="hover-elevate" data-testid={`source-card-${source.id}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{source.name}</h3>
          <Badge variant={getPlatformColor(source.platform)} className="text-xs">
            {source.platform}
          </Badge>
        </div>
        <Button
          size="icon"
          variant={source.enabled ? "default" : "outline"}
          onClick={() => onToggleEnabled(source.id, !source.enabled)}
          disabled={isLoading}
          className="h-8 w-8"
          data-testid={`button-toggle-${source.id}`}
        >
          {source.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
            <p className="text-sm font-semibold text-foreground">
              {formatDate(state?.last_sync_at || null)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Records</p>
            <p className="text-sm font-semibold text-foreground">
              {state?.rows_upserted?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Errors</p>
            <p className="text-sm font-semibold text-destructive">
              {state?.errors || 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Freshness</p>
            <p className="text-sm font-semibold text-foreground">
              {state?.freshness_seconds
                ? `${Math.round(state.freshness_seconds / 3600)}h`
                : 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTriggerIngest(source.id, 'incremental')}
            disabled={isLoading || !source.enabled}
            className="flex-1"
            data-testid={`button-sync-${source.id}`}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Sync
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTriggerIngest(source.id, 'backfill')}
            disabled={isLoading || !source.enabled}
            className="flex-1"
            data-testid={`button-backfill-${source.id}`}
          >
            Backfill
          </Button>
        </div>

        <div className="pt-2 border-t border-card-border">
          <p className="text-xs text-muted-foreground truncate" title={source.endpoint_url}>
            {source.endpoint_url}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
