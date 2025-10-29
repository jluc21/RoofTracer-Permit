import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { Link } from 'wouter';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptime: number;
  database: 'connected' | 'disconnected';
}

interface SourceStatus {
  source_id: number;
  source_name: string;
  platform: string;
  last_sync: string | null;
  records_synced: number;
  errors: number;
  freshness_hours: number | null;
}

export default function StatusPage() {
  const { data: health } = useQuery<HealthStatus>({
    queryKey: ['/api/health'],
  });

  const { data: sourceStatuses } = useQuery<SourceStatus[]>({
    queryKey: ['/api/status'],
  });

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="outline" size="icon" data-testid="button-back-to-map">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">System Status</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor health and data freshness
            </p>
          </div>
        </div>

        {/* Health Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                System Status
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {health?.status === 'healthy' ? (
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-destructive" />
                )}
                <Badge variant={health?.status === 'healthy' ? 'default' : 'destructive'}>
                  {health?.status || 'Unknown'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Uptime
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {health?.uptime ? formatUptime(health.uptime) : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Version
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {health?.version || 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Source Status Timeline */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">Data Source Activity</h2>
          </CardHeader>
          <CardContent>
            {sourceStatuses && sourceStatuses.length > 0 ? (
              <div className="space-y-4">
                {sourceStatuses.map((source) => (
                  <div
                    key={source.source_id}
                    className="flex items-start gap-4 pb-4 border-l-2 border-card-border pl-4"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 flex-shrink-0">
                      <Activity className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {source.source_name}
                        </h3>
                        <Badge variant="secondary" className="text-xs ml-2">
                          {source.platform}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Records</p>
                          <p className="text-sm font-semibold text-foreground">
                            {source.records_synced.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Errors</p>
                          <p className="text-sm font-semibold text-destructive">
                            {source.errors}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Freshness</p>
                          <p className="text-sm font-semibold text-foreground">
                            {source.freshness_hours !== null
                              ? `${source.freshness_hours}h`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Last Sync</p>
                          <p className="text-sm font-semibold text-foreground">
                            {source.last_sync
                              ? new Date(source.last_sync).toLocaleDateString()
                              : 'Never'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No source activity to display
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
