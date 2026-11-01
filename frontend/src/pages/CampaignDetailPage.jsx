import { useCallback, useEffect, useMemo, useState } from 'react';
import { emailStatusClass, emailStatusLabel, formatDateTime, formatDuration } from '../utils/format.js';
import { downloadFile } from '../utils/download.js';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['all', 'not_started', 'queued', 'retrying', 'sent', 'failed', 'skipped'];
const LIVE_STATUSES = new Set(['queued', 'running']);

/** "YYYY-MM-DD" of a timestamp in the given timezone. */
const toLocalDay = (value, timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));

function CampaignDetailPage({ campaignId, request, onBack, onEdit, onAction, onDelete }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [sentFrom, setSentFrom] = useState('');
  const [sentTo, setSentTo] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await request(`/api/campaigns/${campaignId}/detail`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load campaign.');
      setDetail(data.detail);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [campaignId, request]);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setStatusFilter('all');
    setSentFrom('');
    setSentTo('');
    load();
  }, [load]);

  const campaign = detail?.campaign;
  const status = String(campaign?.status || 'draft').toLowerCase();

  // Refresh automatically while the campaign is sending.
  useEffect(() => {
    if (!LIVE_STATUSES.has(status)) return undefined;
    const timer = setInterval(() => load({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [status, load]);

  const timeZone = campaign?.timezone || 'Asia/Kolkata';
  const dateFilterActive = Boolean(sentFrom || sentTo);

  const filteredRecipients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (detail?.recipients || []).filter((recipient) => {
      if (statusFilter !== 'all' && recipient.status !== statusFilter) return false;
      if (sentFrom || sentTo) {
        // Compare the sent date in the campaign's timezone (YYYY-MM-DD sorts as text).
        if (!recipient.sentAt) return false;
        const day = toLocalDay(recipient.sentAt, timeZone);
        if (sentFrom && day < sentFrom) return false;
        if (sentTo && day > sentTo) return false;
      }
      if (!term) return true;
      return [recipient.name, recipient.email, recipient.company, recipient.job_title]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [detail, search, statusFilter, sentFrom, sentTo, timeZone]);

  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRecipients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const runAction = async (action) => {
    const done = await onAction(action, campaignId);
    if (done) load({ silent: true });
  };

  // Exports the recipients for the status chip currently selected (All, Sent, Failed…).
  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadFile(
        request,
        `/api/campaigns/${campaignId}/recipients/export?${new URLSearchParams({
          status: statusFilter,
          ...(sentFrom ? { from: sentFrom } : {}),
          ...(sentTo ? { to: sentTo } : {}),
        })}`,
        'campaign-recipients.xlsx',
      );
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !detail) {
    return (
      <section className="panel full-panel">
        <p>Loading campaign…</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="panel full-panel">
        <div className="notice-panel notice-panel--error" role="alert">{error || 'Campaign not found.'}</div>
        <div><button type="button" className="secondary-btn" onClick={onBack}>Back to campaigns</button></div>
      </section>
    );
  }

  const total = detail.totalContacts || 0;
  const sentPercent = total ? Math.round((detail.sentCount / total) * 100) : 0;
  const failedPercent = total ? Math.round((detail.failedCount / total) * 100) : 0;
  const canEditRecipients = status === 'draft';

  const statusCounts = {
    all: total,
    not_started: detail.notStartedCount,
    queued: detail.queuedCount,
    retrying: detail.retryingCount,
    sent: detail.sentCount,
    failed: detail.failedCount,
    skipped: (detail.recipients || []).filter((recipient) => recipient.status === 'skipped').length,
  };

  const exportCount = dateFilterActive
    ? (detail.recipients || []).filter((recipient) => {
      if (statusFilter !== 'all' && recipient.status !== statusFilter) return false;
      if (!recipient.sentAt || recipient.contactDeleted) return false;
      const day = toLocalDay(recipient.sentAt, timeZone);
      return (!sentFrom || day >= sentFrom) && (!sentTo || day <= sentTo);
    }).length
    : statusCounts[statusFilter];

  return (
    <div className="detail-page">
      <button type="button" className="text-btn back-link" onClick={onBack}>← All campaigns</button>

      <section className="panel">
        <div className="page-header compact-page-header detail-header">
          <div className="page-header-copy">
            <p className="eyebrow">Campaign</p>
            <div className="detail-title-row">
              <h2>{campaign.name}</h2>
              <span className={`campaign-status-pill status-pill--${status}`}>{status}</span>
              {campaign.sendFirst && <span className="send-first-badge">Send first</span>}
            </div>
            <p className="page-subtitle">{campaign.subject}</p>
          </div>

          <div className="detail-actions">
            {(status === 'draft' || status === 'failed') && (
              <button type="button" className="primary-btn small-btn" onClick={() => runAction('start')}>Start</button>
            )}
            {(status === 'running' || status === 'queued') && (
              <button type="button" className="secondary-btn small-btn" onClick={() => runAction('pause')}>Pause</button>
            )}
            {status === 'paused' && (
              <button type="button" className="primary-btn small-btn" onClick={() => runAction('resume')}>Resume</button>
            )}
            <button type="button" className="secondary-btn small-btn" onClick={() => onEdit(campaignId)}>Edit</button>
            <button type="button" className="secondary-btn small-btn" onClick={() => load()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {status !== 'cancelled' && status !== 'completed' && (
              <button type="button" className="secondary-btn danger-btn small-btn" onClick={() => runAction('cancel')}>Cancel</button>
            )}
            <button type="button" className="secondary-btn danger-btn small-btn" onClick={() => onDelete(campaignId)}>Delete</button>
          </div>
        </div>

        {error && <div className="notice-panel notice-panel--error" role="alert">{error}</div>}

        <div className="detail-stats">
          <div className="stat-card"><span>Recipients</span><strong>{total}</strong></div>
          <div className="stat-card stat-card--success"><span>Sent</span><strong>{detail.sentCount}</strong></div>
          <div className="stat-card stat-card--warning"><span>Queued / retrying</span><strong>{detail.queuedCount + detail.retryingCount}</strong></div>
          <div className="stat-card stat-card--danger"><span>Failed</span><strong>{detail.failedCount}</strong></div>
          <div className="stat-card stat-card--muted"><span>Not started</span><strong>{detail.notStartedCount}</strong></div>
        </div>

        <div className="detail-progress" aria-label={`${sentPercent}% sent`}>
          <div className="detail-progress-bar">
            <span className="detail-progress-sent" style={{ width: `${sentPercent}%` }} />
            <span className="detail-progress-failed" style={{ width: `${failedPercent}%` }} />
          </div>
          <small>{sentPercent}% sent · {failedPercent}% failed{LIVE_STATUSES.has(status) ? ' · refreshing every 15s' : ''}</small>
        </div>
      </section>

      <div className="detail-columns">
        <section className="panel">
          <h3>Schedule &amp; settings</h3>
          <dl className="detail-facts">
            <div><dt>Created</dt><dd>{formatDateTime(campaign.createdAt)}</dd></div>
            <div><dt>Scheduled start</dt><dd>{formatDateTime(campaign.startDateTime, 'Not scheduled')}</dd></div>
            <div><dt>Started (queued)</dt><dd>{formatDateTime(campaign.lastScheduledAt, 'Not started')}</dd></div>
            <div><dt>Last run</dt><dd>{formatDateTime(campaign.lastRunAt, 'Not run yet')}</dd></div>
            <div><dt>Last email sent</dt><dd>{formatDateTime(campaign.lastSentAt, 'None yet')}</dd></div>
            <div><dt>Daily limit</dt><dd>{campaign.dailyLimit} / day</dd></div>
            <div><dt>Batch size</dt><dd>{campaign.batchSize} per run</dd></div>
            <div><dt>Delay</dt><dd>{formatDuration(campaign.delayMs)}</dd></div>
            <div><dt>Timezone</dt><dd>{campaign.timezone || '—'}</dd></div>
            <div><dt>Resume</dt><dd>{campaign.resume?.originalName || 'Not attached'}</dd></div>
            <div><dt>Priority</dt><dd>{campaign.sendFirst ? 'Send first' : 'Normal'}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h3>Email</h3>
          <div className="detail-email">
            <strong>{campaign.subject}</strong>
            <pre>{campaign.body}</pre>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-header">
          <h3>Recipients</h3>
          <span className="section-badge">{filteredRecipients.length}</span>
        </div>
        {!canEditRecipients && (
          <p className="muted-text detail-hint">Recipients are locked once a campaign has started.</p>
        )}

        <div className="campaign-toolbar">
          <button
            type="button"
            className="secondary-btn small-btn export-btn"
            onClick={exportExcel}
            disabled={exporting || exportCount === 0}
          >
            {exporting
              ? 'Exporting…'
              : `Export ${statusFilter === 'all' ? 'all' : emailStatusLabel(statusFilter).toLowerCase()} (${exportCount}) to Excel`}
          </button>
          <label className="date-filter">
            <span>Sent from</span>
            <input type="date" value={sentFrom} max={sentTo || undefined} onChange={(event) => { setSentFrom(event.target.value); setPage(1); }} />
          </label>
          <label className="date-filter">
            <span>to</span>
            <input type="date" value={sentTo} min={sentFrom || undefined} onChange={(event) => { setSentTo(event.target.value); setPage(1); }} />
          </label>
          {dateFilterActive && (
            <button type="button" className="text-btn" onClick={() => { setSentFrom(''); setSentTo(''); setPage(1); }}>Clear dates</button>
          )}
          <label className="campaign-search">
            <span className="sr-only">Search recipients</span>
            <input
              type="search"
              value={search}
              placeholder="Search name, email, company, title"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </label>
        </div>

        <div className="status-chip-row" role="tablist" aria-label="Filter recipients by status">
          {STATUS_FILTERS.filter((key) => key === 'all' || statusCounts[key] > 0).map((key) => (
            <button
              key={key}
              type="button"
              className={statusFilter === key ? 'status-chip active' : 'status-chip'}
              onClick={() => { setStatusFilter(key); setPage(1); }}
            >
              {key === 'all' ? 'All' : emailStatusLabel(key)} <span>{statusCounts[key]}</span>
            </button>
          ))}
        </div>

        {pageRows.length === 0 ? (
          <div className="empty-state-box"><p>No recipients match the current filters.</p></div>
        ) : (
          <div className="campaign-table-wrap always-visible">
            <table className="campaign-table small-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Job title</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Scheduled</th>
                  <th>Sent at</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((recipient) => (
                  <tr key={recipient.contactId}>
                    <td>
                      <div className="campaign-name-stack">
                        <strong>{recipient.name || '—'}</strong>
                        <span>{recipient.email}</span>
                      </div>
                    </td>
                    <td>{recipient.company || '—'}</td>
                    <td>{recipient.job_title || '—'}</td>
                    <td>
                      <span className={emailStatusClass(recipient.status)}>{emailStatusLabel(recipient.status)}</span>
                      {recipient.isOptedOut && <small className="muted-text"> · opted out</small>}
                    </td>
                    <td>{recipient.attempts}</td>
                    <td>{formatDateTime(recipient.scheduledFor)}</td>
                    <td>{formatDateTime(recipient.sentAt)}</td>
                    <td className="error-cell" title={recipient.lastError}>{recipient.lastError || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRecipients.length > PAGE_SIZE && (
          <div className="pagination-row">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRecipients.length)} of {filteredRecipients.length}
            </span>
            <div className="pagination-controls">
              <button type="button" className="secondary-btn small-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span className="page-indicator">Page {currentPage} of {totalPages}</span>
              <button type="button" className="secondary-btn small-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default CampaignDetailPage;
