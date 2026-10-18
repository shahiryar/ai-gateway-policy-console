import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import { ErrorAlert, Spinner } from './components/ui';
import { SessionProvider } from './lib/session';
import { ApiError } from './lib/api';
import { OverviewPage } from './pages/Overview';
import { TemplatesPage } from './pages/Templates';
import { TemplateEditorPage } from './pages/TemplateEditor';
import { DlpPage } from './pages/Dlp';
import { DlpEditorPage } from './pages/DlpEditor';
import { PlaygroundPage } from './pages/Playground';
import { AppsPage } from './pages/Apps';
import { AppEditorPage } from './pages/AppEditor';
import { AppDetailPage } from './pages/AppDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider
          fallback={({ error }) => (
            <div className="mx-auto max-w-md p-10">{error ? <ErrorAlert error={error} /> : <Spinner label="Signing in" />}</div>
          )}
        >
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="templates/new" element={<TemplateEditorPage />} />
              <Route path="templates/:id" element={<TemplateEditorPage />} />
              <Route path="dlp" element={<DlpPage />} />
              <Route path="dlp/:kind/new" element={<DlpEditorPage />} />
              <Route path="dlp/:kind/:id" element={<DlpEditorPage />} />
              <Route path="playground" element={<PlaygroundPage />} />
              <Route path="apps" element={<AppsPage />} />
              <Route path="apps/new" element={<AppEditorPage />} />
              <Route path="apps/:id" element={<AppDetailPage />} />
              <Route path="apps/:id/edit" element={<AppEditorPage />} />
              <Route path="*" element={<p className="text-sm text-slate-600">Page not found.</p>} />
            </Route>
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
