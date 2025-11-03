import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Database, Activity } from "lucide-react";
import NotFound from "@/pages/not-found";
import MapView from "@/pages/MapView";
import SourcesPage from "@/pages/SourcesPage";
import StatusPage from "@/pages/StatusPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MapView} />
      <Route path="/sources" component={SourcesPage} />
      <Route path="/status" component={StatusPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        {/* Quick navigation buttons - only show on map view */}
        <div className="fixed bottom-4 left-4 z-10 flex flex-col gap-2">
          <Link href="/sources">
            <Button
              size="default"
              variant="default"
              className="shadow-lg"
              title="Manage Sources & Ingest Data"
              data-testid="button-nav-sources"
            >
              <Database className="h-5 w-5 mr-2" />
              Admin
            </Button>
          </Link>
          <Link href="/status">
            <Button
              size="icon"
              variant="secondary"
              className="shadow-lg"
              title="System Status"
              data-testid="button-nav-status"
            >
              <Activity className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
