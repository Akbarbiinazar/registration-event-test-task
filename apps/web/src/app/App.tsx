import { BrowserRouter, Route, Routes } from 'react-router';
import {
  CreateEventPage,
  EventCreatedPage,
  EventListPage,
  OrganizerPage,
  PublicEventPage,
} from '@/features/events';

export function App() {
  return (
    <BrowserRouter>
      <main style={{ padding: 'var(--space-4)' }}>
        <Routes>
          <Route path="/" element={<EventListPage />} />
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route path="/events/:id/created" element={<EventCreatedPage />} />
          <Route path="/e/:id" element={<PublicEventPage />} />
          <Route path="/o/:id" element={<OrganizerPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
