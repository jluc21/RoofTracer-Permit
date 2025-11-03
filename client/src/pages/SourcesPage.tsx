import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SourceCard } from '@/components/SourceCard';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Source, SourceState } from '@shared/schema';

export default function SourcesPage() {
  const { toast } = useToast();

  const { data: sources, isLoading: sourcesLoading } = useQuery<Source[]>({
    queryKey: ['/api/sources'],
  });

  const { data: states } = useQuery<SourceState[]>({
    queryKey: ['/api/sources/state'],
    refetchInterval: (query) => {
      // Poll every 2 seconds if any source is running
      const hasRunning = query.state.data?.some(s => s.is_running === 1);
      return hasRunning ? 2000 : false;
    },
  });
  
  // Show toast when status changes
  useEffect(() => {
    if (!states) return;
    
    states.forEach((state) => {
      if (state.status_message && state.is_running === 1) {
        const source = sources?.find(s => s.id === state.source_id);
        if (source) {
          toast({
            title: source.name,
            description: state.status_message,
            duration: 3000,
          });
        }
      }
    });
  }, [states?.map(s => s.status_message).join(',')]); // Only trigger when messages change

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ sourceId, enabled }: { sourceId: number; enabled: boolean }) => {
      return apiRequest('PATCH', `/api/sources/${sourceId}`, { enabled: enabled ? 1 : 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sources'] });
      toast({
        title: 'Source updated',
        description: 'Source status has been changed.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update source.',
        variant: 'destructive',
      });
    },
  });

  const triggerIngestMutation = useMutation({
    mutationFn: async ({ sourceId, mode }: { sourceId: number; mode: 'backfill' | 'incremental' }) => {
      return apiRequest('POST', `/api/sources/${sourceId}/ingest?mode=${mode}`, {});
    },
    onSuccess: () => {
      toast({
        title: 'Ingestion started',
        description: 'Data ingestion has been triggered.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sources/state'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to trigger ingestion.',
        variant: 'destructive',
      });
    },
  });

  const getStateForSource = (sourceId: number) => {
    return states?.find((s) => s.source_id === sourceId);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon" data-testid="button-back-to-map">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Data Sources</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage permit data sources and ingestion schedules
              </p>
            </div>
          </div>
          <Button data-testid="button-add-source" disabled>
            <Plus className="h-5 w-5 mr-2" />
            Add Source
          </Button>
        </div>

        {sourcesLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">Loading sources...</p>
          </div>
        )}

        {!sourcesLoading && sources && sources.length === 0 && (
          <div className="text-center py-12 bg-card rounded-lg border border-card-border">
            <p className="text-sm text-foreground mb-2">No data sources configured yet</p>
            <p className="text-xs text-muted-foreground">
              Add your first source to start ingesting permit data
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources?.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              state={getStateForSource(source.id)}
              onTriggerIngest={(sourceId, mode) =>
                triggerIngestMutation.mutate({ sourceId, mode })
              }
              onToggleEnabled={(sourceId, enabled) =>
                toggleEnabledMutation.mutate({ sourceId, enabled })
              }
              isLoading={triggerIngestMutation.isPending || toggleEnabledMutation.isPending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
