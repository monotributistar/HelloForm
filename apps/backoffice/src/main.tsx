import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme/theme.css';
import {
  ControlRow,
  DataTable,
  NumberInput,
  Panel,
  PrimaryButton,
  StatCard,
  TextInput
} from './components/ui.js';

const API_BASE = 'http://localhost:3000';
const ADMIN_ROLE = 'tenant_admin';
const ACTOR_EMAIL = 'ops@helloform.local';

type AggregateMetrics = {
  totalLogs: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  completionRate: number;
};

type FieldFriction = {
  fieldId: string;
  avgAttempts: number;
  confirmationRate: number;
  samples: number;
};

type DailyUsage = {
  day: string;
  logs: number;
  costUsd: number;
  units: number;
};

type UsageLog = {
  id: string;
  createdAt: string;
  model: string;
  operation: string;
  units: number;
  estimatedCostUsd: number;
};

type TenantUser = { id: string; email: string; name: string; role: string; active: boolean; updatedAt: string };
type Campaign = { id: string; name: string; status: string; updatedAt: string };
type Survey = { id: string; name: string; status: string; campaignId: string | null; updatedAt: string };
type AuditLog = { id: string; createdAt: string; actorEmail: string; action: string; resource: string; resourceId: string };

type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

async function api<T>(path: string, init?: RequestInit, tenantIdHeader?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': ADMIN_ROLE,
      'x-actor-email': ACTOR_EMAIL,
      ...(tenantIdHeader ? { 'x-tenant-id': tenantIdHeader } : {})
    },
    ...init
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return (await response.json()) as T;
}

function App() {
  const [tenantId, setTenantId] = React.useState('tenant-poc');
  const [surveyId, setSurveyId] = React.useState('survey-poc');
  const [days, setDays] = React.useState(7);
  const [q, setQ] = React.useState('');

  const [agg, setAgg] = React.useState<AggregateMetrics | null>(null);
  const [fields, setFields] = React.useState<FieldFriction[]>([]);
  const [daily, setDaily] = React.useState<DailyUsage[]>([]);
  const [logs, setLogs] = React.useState<UsageLog[]>([]);

  const [users, setUsers] = React.useState<TenantUser[]>([]);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [surveys, setSurveys] = React.useState<Survey[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);

  const [usersPage, setUsersPage] = React.useState(1);
  const [campaignsPage, setCampaignsPage] = React.useState(1);
  const [surveysPage, setSurveysPage] = React.useState(1);
  const [auditPage, setAuditPage] = React.useState(1);

  const [userEmail, setUserEmail] = React.useState('');
  const [userName, setUserName] = React.useState('');
  const [userRole, setUserRole] = React.useState('tenant_admin');

  const [campaignName, setCampaignName] = React.useState('');
  const [surveyName, setSurveyName] = React.useState('');
  const [surveyCampaignId, setSurveyCampaignId] = React.useState('');

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const loadAll = async () => {
    setError(null);
    setSuccess(null);
    try {
      const [aggData, fieldData, dailyData, usageLogs, userData, campaignData, surveyData, auditData] =
        await Promise.all([
          api<AggregateMetrics>(`/metrics/tenant/${tenantId}?surveyId=${surveyId}`),
          api<FieldFriction[]>(`/metrics/tenant/${tenantId}/survey/${surveyId}/fields`),
          api<DailyUsage[]>(`/metrics/tenant/${tenantId}/daily?surveyId=${surveyId}&days=${days}`),
          api<UsageLog[]>(`/ai/usage-logs?tenantId=${tenantId}&limit=20`),
          api<Paginated<TenantUser>>(`/tenant-users?tenantId=${tenantId}&page=${usersPage}&pageSize=10&q=${encodeURIComponent(q)}`),
          api<Paginated<Campaign>>(`/campaigns?tenantId=${tenantId}&page=${campaignsPage}&pageSize=10&q=${encodeURIComponent(q)}`),
          api<Paginated<Survey>>(`/surveys?tenantId=${tenantId}&page=${surveysPage}&pageSize=10&q=${encodeURIComponent(q)}`),
          api<Paginated<AuditLog>>(`/audit-logs?tenantId=${tenantId}&page=${auditPage}&pageSize=10&q=${encodeURIComponent(q)}`)
        ]);
      setAgg(aggData);
      setFields(fieldData);
      setDaily(dailyData);
      setLogs(usageLogs);
      setUsers(userData.items);
      setCampaigns(campaignData.items);
      setSurveys(surveyData.items);
      setAuditLogs(auditData.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading backoffice data');
    }
  };

  const createUser = async () => {
    try {
      await api('/tenant-users', {
        method: 'POST',
        body: JSON.stringify({ tenantId, email: userEmail, name: userName, role: userRole })
      }, tenantId);
      setSuccess('User saved');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating user');
    }
  };

  const updateUserState = async (u: TenantUser, active: boolean) => {
    try {
      await api(`/tenant-users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenantId, active, expectedUpdatedAt: u.updatedAt })
      }, tenantId);
      setSuccess(`User ${active ? 'activated' : 'deactivated'}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating user');
    }
  };

  const createCampaign = async () => {
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ tenantId, name: campaignName, status: 'active' })
      }, tenantId);
      setSuccess('Campaign created');
      setCampaignName('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating campaign');
    }
  };

  const updateCampaignStatus = async (c: Campaign, status: string) => {
    try {
      await api(`/campaigns/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenantId, status, expectedUpdatedAt: c.updatedAt })
      }, tenantId);
      setSuccess(`Campaign set to ${status}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating campaign');
    }
  };

  const createSurvey = async () => {
    try {
      await api('/surveys', {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          campaignId: surveyCampaignId || undefined,
          name: surveyName,
          status: 'draft'
        })
      }, tenantId);
      setSuccess('Survey created');
      setSurveyName('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating survey');
    }
  };

  const updateSurveyStatus = async (s: Survey, status: string) => {
    try {
      await api(`/surveys/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenantId, status, expectedUpdatedAt: s.updatedAt })
      }, tenantId);
      setSuccess(`Survey set to ${status}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating survey');
    }
  };

  React.useEffect(() => {
    void loadAll();
  }, [usersPage, campaignsPage, surveysPage, auditPage]);

  return (
    <main className="hf-page">
      <h1 className="hf-title">HelloForm Backoffice</h1>
      <p className="hf-subtitle">Separate admin app focused on operations and controls.</p>

      <Panel title="Context">
        <ControlRow>
          <TextInput value={tenantId} onChange={setTenantId} placeholder="Tenant" />
          <TextInput value={surveyId} onChange={setSurveyId} placeholder="Survey" />
          <NumberInput value={days} onChange={setDays} min={1} max={90} placeholder="Days" />
          <TextInput value={q} onChange={setQ} placeholder="Search" />
          <PrimaryButton onClick={() => void loadAll()}>Reload</PrimaryButton>
        </ControlRow>
        {error ? <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
        {success ? <p style={{ color: 'var(--primary-strong)', margin: 0 }}>{success}</p> : null}
      </Panel>

      {agg ? (
        <Panel title="Core KPIs">
          <div className="hf-grid">
            <StatCard label="Total Logs" value={String(agg.totalLogs)} />
            <StatCard label="Cost (USD)" value={agg.totalCostUsd.toFixed(4)} />
            <StatCard label="Avg Latency (ms)" value={String(Math.round(agg.avgLatencyMs))} />
            <StatCard label="Completion" value={`${(agg.completionRate * 100).toFixed(1)}%`} />
          </div>
        </Panel>
      ) : null}

      <Panel title="Tenant Users">
        <ControlRow>
          <TextInput value={userEmail} onChange={setUserEmail} placeholder="Email" />
          <TextInput value={userName} onChange={setUserName} placeholder="Name" />
          <TextInput value={userRole} onChange={setUserRole} placeholder="Role" />
          <PrimaryButton onClick={() => void createUser()}>Save User</PrimaryButton>
          <PrimaryButton onClick={() => setUsersPage((p) => Math.max(1, p - 1))}>Prev</PrimaryButton>
          <PrimaryButton onClick={() => setUsersPage((p) => p + 1)}>Next</PrimaryButton>
        </ControlRow>
        <DataTable
          headers={['Email', 'Name', 'Role', 'Active']}
          rows={users.map((u) => [u.email, u.name, u.role, u.active ? 'yes' : 'no'])}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => void updateUserState(u, !u.active)}
              style={{ border: '1px solid var(--border)', background: 'white', borderRadius: 8, padding: '6px 10px' }}
            >
              {u.active ? `Deactivate ${u.email}` : `Activate ${u.email}`}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Campaigns & Surveys">
        <ControlRow>
          <TextInput value={campaignName} onChange={setCampaignName} placeholder="Campaign name" />
          <PrimaryButton onClick={() => void createCampaign()}>Create Campaign</PrimaryButton>
          <PrimaryButton onClick={() => setCampaignsPage((p) => Math.max(1, p - 1))}>Prev</PrimaryButton>
          <PrimaryButton onClick={() => setCampaignsPage((p) => p + 1)}>Next</PrimaryButton>
        </ControlRow>
        <DataTable
          headers={['Campaign ID', 'Name', 'Status']}
          rows={campaigns.map((c) => [c.id, c.name, c.status])}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 12 }}>
          {campaigns.map((c) => (
            <React.Fragment key={c.id}>
              <button
                onClick={() => void updateCampaignStatus(c, 'paused')}
                style={{ border: '1px solid var(--border)', background: 'white', borderRadius: 8, padding: '6px 10px' }}
              >
                Pause {c.name}
              </button>
              <button
                onClick={() => void updateCampaignStatus(c, 'active')}
                style={{ border: '1px solid var(--border)', background: 'white', borderRadius: 8, padding: '6px 10px' }}
              >
                Activate {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <ControlRow>
          <TextInput value={surveyName} onChange={setSurveyName} placeholder="Survey name" />
          <TextInput value={surveyCampaignId} onChange={setSurveyCampaignId} placeholder="Campaign ID (optional)" />
          <PrimaryButton onClick={() => void createSurvey()}>Create Survey</PrimaryButton>
          <PrimaryButton onClick={() => setSurveysPage((p) => Math.max(1, p - 1))}>Prev</PrimaryButton>
          <PrimaryButton onClick={() => setSurveysPage((p) => p + 1)}>Next</PrimaryButton>
        </ControlRow>
        <DataTable
          headers={['Survey ID', 'Name', 'Status', 'Campaign ID']}
          rows={surveys.map((s) => [s.id, s.name, s.status, s.campaignId ?? '-'])}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {surveys.map((s) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => void updateSurveyStatus(s, 'published')}
                style={{ border: '1px solid var(--border)', background: 'white', borderRadius: 8, padding: '6px 10px' }}
              >
                Publish {s.name}
              </button>
              <button
                onClick={() => void updateSurveyStatus(s, 'archived')}
                style={{ border: '1px solid var(--border)', background: 'white', borderRadius: 8, padding: '6px 10px' }}
              >
                Archive {s.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </Panel>

      <Panel title="Daily Trend">
        <DataTable
          headers={['Day', 'Logs', 'Cost USD', 'Units']}
          rows={daily.map((d) => [d.day, d.logs, d.costUsd.toFixed(6), d.units])}
        />
      </Panel>

      <Panel title="Field Friction">
        <DataTable
          headers={['Field', 'Avg Attempts', 'Confirmation', 'Samples']}
          rows={fields.map((f) => [
            f.fieldId,
            f.avgAttempts.toFixed(2),
            `${(f.confirmationRate * 100).toFixed(1)}%`,
            f.samples
          ])}
        />
      </Panel>

      <Panel title="Recent Usage Logs">
        <DataTable
          headers={['At', 'Op', 'Model', 'Units', 'Cost']}
          rows={logs.map((l) => [
            new Date(l.createdAt).toLocaleString(),
            l.operation,
            l.model,
            l.units,
            l.estimatedCostUsd.toFixed(6)
          ])}
        />
      </Panel>

      <Panel title="Audit Explorer">
        <ControlRow>
          <PrimaryButton onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>Prev</PrimaryButton>
          <PrimaryButton onClick={() => setAuditPage((p) => p + 1)}>Next</PrimaryButton>
        </ControlRow>
        <DataTable
          headers={['At', 'Actor', 'Action', 'Resource', 'Resource ID']}
          rows={auditLogs.map((a) => [
            new Date(a.createdAt).toLocaleString(),
            a.actorEmail,
            a.action,
            a.resource,
            a.resourceId
          ])}
        />
      </Panel>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
