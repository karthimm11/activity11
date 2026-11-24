import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigError } from './supabase.js';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  matchId: '',
  stand: 'general',
  tickets: '1',
  aisle: false,
  accessible: false,
};

function formatMatchDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export default function App() {
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3500);
  }, []);

  const loadMatches = useCallback(async (showLoading = false) => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    const { data, error: queryError } = await supabase
      .from('matches')
      .select('*')
      .order('match_date', { ascending: true });

    if (queryError) {
      setError(`Could not load matches: ${queryError.message}`);
      setLoading(false);
      return;
    }

    setMatches(data ?? []);
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    void loadMatches(true);
    const channel = supabase
      .channel('matches-availability')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => void loadMatches(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live updates are unavailable. Check the Supabase Realtime setup.');
        }
      });

    return () => {
      window.clearTimeout(toastTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [loadMatches]);

  const updateForm = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const selectMatch = (match) => {
    setForm((current) => ({ ...current, matchId: String(match.id) }));
    document.querySelector('#booking-form')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
    document.querySelector('#name')?.focus({ preventScroll: true });
    showToast(`${match.home_team} vs ${match.away_team} selected.`);
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError('');
    const { data, error: bookingError } = await supabase.rpc('book_tickets', {
      p_match_id: Number(form.matchId),
      p_customer_name: form.name.trim(),
      p_customer_email: form.email.trim(),
      p_customer_phone: form.phone,
      p_stand_category: form.stand,
      p_ticket_count: Number(form.tickets),
      p_aisle_seats: form.aisle,
      p_accessible_seating: form.accessible,
    });

    setSubmitting(false);
    if (bookingError) {
      setError(`Booking failed: ${bookingError.message}`);
      return;
    }

    setForm(initialForm);
    showToast(`Booking confirmed. Reference: ${data}`);
    await loadMatches();
  };

  const selectedMatch = matches.find((match) => String(match.id) === form.matchId);
  const maxTickets = selectedMatch
    ? Math.min(10, selectedMatch.available_seats)
    : 10;
  const standLabels = {
    general: 'General',
    premium: 'Premium',
    hospitality: 'Hospitality',
  };
  const ticketCount = Number(form.tickets);
  const summaryTickets = Number.isInteger(ticketCount) && ticketCount > 0
    ? ticketCount
    : 0;
  const bookingPreferences = [
    form.aisle ? 'Aisle seats' : null,
    form.accessible ? 'Accessible seating' : null,
  ].filter(Boolean);

  return (
    <main id="top" className="page-shell">
      <header className="page-header">
        <a className="brand" href="#top">IPL TICKETS</a>
        <a className="header-link" href="#booking-form">Book tickets</a>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Game day starts here</p>
        <h1 id="page-title">IPL Ticket Booking</h1>
        <p className="intro">
          Choose a match, pick your stand, and get ready for the roar of the crowd.
        </p>
      </section>

      {supabaseConfigError && (
        <div className="notice" role="alert">
          <strong>Supabase is not configured.</strong>
          <span>
            Add {supabaseConfigError} to a local <code>.env</code> file using the values
            from your Supabase project, then restart the development server.
          </span>
        </div>
      )}

      {error && <div className="error-message" role="alert">{error}</div>}

      <section className="content-card schedule" aria-labelledby="schedule-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live from the database</p>
            <h2 id="schedule-heading">Upcoming matches</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadMatches(true)}
            disabled={!supabase || loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="message">Loading matches…</p>
        ) : matches.length === 0 ? (
          <p className="message">
            {supabase ? 'No matches are available right now.' : 'Configure Supabase to load matches.'}
          </p>
        ) : (
          <div className="match-list">
            {matches.map((match) => (
              <article className="match-card" key={match.id}>
                <div className="match-info">
                  <h3>{match.home_team} <span>vs</span> {match.away_team}</h3>
                  <p>{formatMatchDate(match.match_date)} · {match.venue}</p>
                  <p className="availability">
                    {match.available_seats.toLocaleString()} seats available
                  </p>
                </div>
                <button
                  className="primary-button book-match"
                  type="button"
                  onClick={() => selectMatch(match)}
                  disabled={match.available_seats < 1}
                >
                  {match.available_seats < 1 ? 'Sold out' : 'Book'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="content-card rules-card" aria-labelledby="rules-heading">
        <p className="eyebrow">Before you book</p>
        <h2 id="rules-heading">Booking rules</h2>
        <ul className="rules-list">
          <li>Maximum 10 tickets can be booked in one transaction.</li>
          <li>Booking is confirmed only if seats remain available for the selected match.</li>
          <li>Seat preferences are subject to stadium availability.</li>
          <li>Entry requires a valid booking reference and a matching photo ID.</li>
        </ul>
      </section>

      <section id="booking-form" className="content-card booking-card" aria-labelledby="booking-heading">
        <p className="eyebrow">Your seat at the stadium</p>
        <h2 id="booking-heading">Complete your booking</h2>
        <p className="section-intro">All fields marked required must be completed.</p>

        <div className="booking-layout">
          <form onSubmit={submitBooking}>
            <div className="form-grid">
            <div className="field field-full">
              <label htmlFor="name">Full name <span aria-hidden="true">*</span></label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength="2"
                maxLength="60"
                required
                value={form.name}
                onChange={updateForm}
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email address <span aria-hidden="true">*</span></label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength="254"
                placeholder="you@example.com"
                required
                value={form.email}
                onChange={updateForm}
              />
            </div>

            <div className="field">
              <label htmlFor="phone">Phone number <span aria-hidden="true">*</span></label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                minLength="10"
                maxLength="10"
                placeholder="10-digit number"
                aria-describedby="phone-hint"
                required
                value={form.phone}
                onChange={updateForm}
              />
            </div>
            <p className="hint" id="phone-hint">Enter 10 digits, with no spaces or country code.</p>

            <div className="field">
              <label htmlFor="match">Match <span aria-hidden="true">*</span></label>
              <select
                id="match"
                name="matchId"
                value={form.matchId}
                onChange={updateForm}
                required
                disabled={!matches.length}
              >
                <option value="" disabled>Choose a match</option>
                {matches.map((match) => (
                  <option
                    value={match.id}
                    key={match.id}
                    disabled={match.available_seats < 1}
                  >
                    {match.home_team} vs {match.away_team} ({match.available_seats} seats)
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="stand">Stand category <span aria-hidden="true">*</span></label>
              <select id="stand" name="stand" value={form.stand} onChange={updateForm} required>
                <option value="general">General</option>
                <option value="premium">Premium</option>
                <option value="hospitality">Hospitality</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="tickets">Number of tickets <span aria-hidden="true">*</span></label>
              <input
                id="tickets"
                name="tickets"
                type="number"
                min="1"
                max={maxTickets}
                step="1"
                required
                value={form.tickets}
                onChange={updateForm}
              />
            </div>

            <fieldset className="preferences">
              <legend>Booking preferences (optional)</legend>
              <label className="choice">
                <input
                  type="checkbox"
                  name="aisle"
                  checked={form.aisle}
                  onChange={updateForm}
                />
                Aisle seats
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  name="accessible"
                  checked={form.accessible}
                  onChange={updateForm}
                />
                Accessible seating
              </label>
            </fieldset>

            <div className="actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!supabase || submitting || !matches.length}
              >
                {submitting ? 'Booking…' : 'Confirm booking'}
              </button>
              <button
                className="secondary-button"
                type="reset"
                onClick={() => setForm(initialForm)}
              >
                Reset form
              </button>
            </div>
            </div>
          </form>

          <aside className="booking-summary" aria-labelledby="summary-heading">
            <p className="eyebrow">Review details</p>
            <h3 id="summary-heading">Booking summary</h3>
            <dl>
              <div>
                <dt>Match</dt>
                <dd>
                  {selectedMatch
                    ? `${selectedMatch.home_team} vs ${selectedMatch.away_team}`
                    : 'Not selected'}
                </dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{selectedMatch?.venue ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt>Stand</dt>
                <dd>{standLabels[form.stand]}</dd>
              </div>
              <div>
                <dt>Tickets</dt>
                <dd>{summaryTickets || 'Not selected'}</dd>
              </div>
              <div>
                <dt>Preferences</dt>
                <dd>{bookingPreferences.length ? bookingPreferences.join(', ') : 'None'}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </main>
  );
}
