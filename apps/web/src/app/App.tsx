import { BrowserRouter, Route, Routes } from 'react-router';
import {
  CreateEventPage,
  CheckinPage,
  EventCreatedPage,
  EventListPage,
  OrganizerPage,
  PublicEventPage,
  TicketPage,
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
          <Route path="/t/:token" element={<TicketPage />} />
          <Route path="/o/:id" element={<OrganizerPage />} />
          <Route path="/o/:id/checkin" element={<CheckinPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
