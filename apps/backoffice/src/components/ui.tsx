import React from 'react';

export function Panel(props: { title?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: 16,
        marginBottom: 16
      }}
    >
      {props.title ? <h2 style={{ margin: '0 0 12px' }}>{props.title}</h2> : null}
      {props.children}
    </section>
  );
}

export function ControlRow(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 16,
        alignItems: 'center'
      }}
    >
      {props.children}
    </div>
  );
}

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      style={{
        minWidth: 180,
        height: 38,
        padding: '0 12px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--text)'
      }}
    />
  );
}

export function NumberInput(props: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      min={props.min}
      max={props.max}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      placeholder={props.placeholder}
      style={{
        width: 110,
        height: 38,
        padding: '0 12px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--text)'
      }}
    />
  );
}

export function PrimaryButton(props: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        height: 38,
        border: '1px solid var(--primary)',
        background: 'var(--primary)',
        color: '#fff',
        padding: '0 14px',
        borderRadius: 10,
        cursor: 'pointer'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = 'var(--primary-strong)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'var(--primary)';
      }}
    >
      {props.children}
    </button>
  );
}

export function StatCard(props: { label: string; value: string }) {
  return (
    <article
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
        {props.label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700 }}>{props.value}</p>
    </article>
  );
}

export function DataTable(props: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {props.headers.map((h) => (
              <th
                key={h}
                style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted)', padding: '8px 6px' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              {row.map((col, j) => (
                <td key={j} style={{ padding: '10px 6px' }}>
                  {col}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
