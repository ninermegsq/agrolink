import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useSearch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AppDashboard from "./pages/AppDashboard";
import Login from "./pages/Login";
import { Privacy, Terms } from "./pages/Legal";

function DashboardRoute() {
  const search = useSearch();
  return <AppDashboard demo={new URLSearchParams(search).get("demo") === "1"} />;
}

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/app" component={DashboardRoute} />
    <Route path="/login" component={Login} />
    <Route path="/terms" component={Terms} />
    <Route path="/privacy" component={Privacy} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster position="bottom-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
