import { useCallback, useEffect, useState } from 'react';
import { emailStatusClass, emailStatusLabel, formatDateTime } from '../utils/format.js';
import { downloadFile } from '../utils/download.js';

const USAGE_FILTERS = [
  { key: 'all', label: 'All contacts' },
  { key: 'used', label: 'Used in a campaign' },
  { key: 'unused', label: 'Never used' },
];

function ContactsPage({ request, onOpenCampaign }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalContacts: 0, usedContacts: 0, unusedContacts: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 25 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [used, setUsed] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [skipOptedOut, setSkipOptedOut] = useState(true);

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), used });
      if (search) params.set('search', search);
      const response = await request(`/api/contacts/usage?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load contacts.');
      setRows(data.contacts || []);
      setSummary(data.summary);
      setPagination(data.pagination);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, used, search, request]);

  useEffect(() => { load(); }, [load]);

  // Exports every contact matching the current search + filter (not just this page).
  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ used, excludeOptedOut: String(skipOptedOut) });
      if (search) params.set('search', search);
      await downloadFile(request, `/api/contacts/export?${params}`, 'contacts.xlsx');
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting(false);
    }
  };

  const toggle = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const firstRow = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastRow = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <section className="panel full-panel">
      <div className="page-header compact-page-header">
        <div>
          <p className="eyebrow">Contacts</p>
          <h2>Contacts</h2>
          <p className="page-subtitle">Every contact you've imported, and which campaigns they were used in and when.</p>
        </div>
        <div className="detail-actions">
          <button type="button" className="secondary-btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="primary-btn" onClick={exportExcel} disabled={exporting || pagination.total === 0}>
            {exporting ? 'Exporting…' : `Export ${pagination.total} to Excel`}
          </button>
        </div>
      </div>

      <div className="summary-grid compact-grid contacts-summary">
        <button type="button" className={used === 'all' ? 'summary-card summary-card--active' : 'summary-card'} onClick={() => { setUsed('all'); setPage(1); }}>
          <span>Total contacts</span><strong>{summary.totalContacts}</strong>
        </button>
        <button type="button" className={used === 'used' ? 'summary-card summary-card--active' : 'summary-card'} onClick={() => { setUsed('used'); setPage(1); }}>
          <span>Used in campaigns</span><strong>{summary.usedContacts}</strong>
        </button>
        <button type="button" className={used === 'unused' ? 'summary-card summary-card--active' : 'summary-card'} onClick={() => { setUsed('unused'); setPage(1); }}>
          <span>Never used</span><strong>{summary.unusedContacts}</strong>
        </button>
      </div>

      <div className="campaign-toolbar">
        <label className="campaign-search">
          <span className="sr-only">Search contacts</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email, company, title"
          />
        </label>
        <label className="campaign-filter">
          <span className="sr-only">Filter by usage</span>
          <select value={used} onChange={(event) => { setUsed(event.target.value); setPage(1); }}>
            {USAGE_FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
          </select>
        </label>
        <label className="campaign-sort">
          <span className="sr-only">Rows per page</span>
          <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
          </select>
        </label>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={skipOptedOut} onChange={(event) => setSkipOptedOut(event.target.checked)} />
        <span>Leave out contacts who opted out (recommended before sending again)</span>
      </label>

      {error && <div className="notice-panel notice-panel--error" role="alert">{error}</div>}

      {!loading && rows.length === 0 ? (
        <div className="empty-state-box"><p>No contacts match the current filters.</p></div>
      ) : (
        <div className={loading ? 'campaign-table-wrap always-visible is-loading' : 'campaign-table-wrap always-visible'}>
          <table className="campaign-table small-table contacts-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Company</th>
                <th>Job title</th>
                <th>Added</th>
                <th>Campaigns</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((contact) => {
                const isOpen = expanded.has(contact._id);
                return (
                  <tr key={contact._id}>
                    <td>
                      <div className="campaign-name-stack">
                        <strong>{contact.name || '—'}</strong>
                        <span>{contact.email}</span>
                        {contact.isOptedOut && <small className="email-status email-status--failed">Opted out</small>}
                      </div>
                    </td>
                    <td>{contact.company || '—'}</td>
                    <td>{contact.job_title || '—'}</td>
                    <td>{formatDateTime(contact.createdAt)}</td>
                    <td className="usage-cell">
                      {contact.campaignCount === 0 ? (
                        <span className="muted-text">Not used yet</span>
                      ) : (
                        <>
                          <button type="button" className="text-btn usage-toggle" onClick={() => toggle(contact._id)} aria-expanded={isOpen}>
                            {contact.campaignCount} campaign{contact.campaignCount > 1 ? 's' : ''} · {contact.sentCount} sent {isOpen ? '▴' : '▾'}
                          </button>
                          {isOpen && (
                            <ul className="usage-list">
                              {contact.usage.map((entry) => (
                                <li key={entry.campaignId}>
                                  <button type="button" className="usage-campaign" onClick={() => onOpenCampaign(entry.campaignId)}>
                                    {entry.campaignName}
                                  </button>
                                  <span className={emailStatusClass(entry.emailStatus)}>{emailStatusLabel(entry.emailStatus)}</span>
                                  <small>
                                    Added {formatDateTime(entry.addedAt)}
                                    {entry.sentAt ? ` · Sent ${formatDateTime(entry.sentAt)}` : ''}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </td>
                    <td>{formatDateTime(contact.lastUsedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination-row">
        <span>Showing {firstRow}–{lastRow} of {pagination.total}</span>
        <div className="pagination-controls">
          <button type="button" className="secondary-btn small-btn" disabled={pagination.page <= 1 || loading} onClick={() => setPage(pagination.page - 1)}>Previous</button>
          <span className="page-indicator">Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" className="secondary-btn small-btn" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => setPage(pagination.page + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}

export default ContactsPage;
