import { getDocumentAsync } from 'expo-document-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { readSheet } from 'read-excel-file/browser';
import { PageTitle, Panel } from '../../../components/admin';
import { Tag } from '../../../components/kit';
import { Banner, Button } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';

type Result = { row: number; ok: boolean; public_code?: string; legacy_ref?: string; error?: string };

// Reads data-import/offline_clients_template.xlsx (sheet "Clients"): row 1 = field
// keys, row 2 = readable headers, data from row 3. Grey example rows are skipped.
function toCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export default function ImportClients() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null); setResults(null);
    const res = await getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try {
      const blob = a.file ?? (await (await fetch(a.uri)).blob());
      const data = await readSheet(blob, 'Clients');
      const keys = (data[0] ?? []).map(toCell);
      if (!keys.includes('first_name') || !keys.includes('gender')) throw new Error('This is not the Zaujyn client template (sheet "Clients" with the key row).');
      const out = data.slice(2).map((r) => Object.fromEntries(keys.map((k, i) => [k, toCell(r[i])])))
        .filter((r) => Object.values(r).some(Boolean) && !/EXAMPLE ROW/i.test(r.staff_notes ?? ''));
      setRows(out); setFileName(a.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runImport() {
    setBusy(true); setError(null);
    const all: Result[] = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error: err } = await supabase.rpc('admin_import_offline_profiles', { p_rows: rows.slice(i, i + 200) });
      if (err) { setError(err.message); break; }
      all.push(...((data ?? []) as Result[]).map((r) => ({ ...r, row: r.row + i + 2 })));
    }
    setResults(all); setBusy(false);
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <>
      <PageTitle title="WhatsApp import" sub="Upload the filled Excel template to add your existing bureau clients" />
      <Panel>
        <Text style={{ color: colors.text, lineHeight: 21 }}>
          1. Fill <Text style={{ fontWeight: '700' }}>offline_clients_template.xlsx</Text> (one client per row; delete the grey example rows).{'\n'}
          2. Upload it here and check the count.{'\n'}
          3. Import. Clients are bureau-managed, and stay hidden from members until “Agreed to be listed” is yes.
        </Text>
        <Button title={fileName ? `Change file (${fileName})` : 'Choose Excel file'} variant="secondary" onPress={pick} />
        {error && <Banner kind="error">{error}</Banner>}
        {rows.length > 0 && !results && (
          <>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{rows.length} clients ready to import</Text>
            <Text style={{ color: colors.muted }}>{rows.slice(0, 5).map((r) => `${r.legacy_ref || '—'} ${r.first_name}`).join(' · ')}{rows.length > 5 ? ' …' : ''}</Text>
            <Button title={`Import ${rows.length} clients`} onPress={runImport} loading={busy} />
          </>
        )}
      </Panel>
      {results && (
        <Panel>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>{okCount} imported · {results.length - okCount} need fixing</Text>
          {results.filter((r) => !r.ok).map((r) => (
            <View key={r.row} style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              <Tag label={`Excel row ${r.row + 1}`} tone="red" />
              <Text style={{ color: colors.text }}>{r.legacy_ref ? `${r.legacy_ref}: ` : ''}{r.error}</Text>
            </View>
          ))}
          {okCount > 0 && <Text style={{ color: colors.muted }}>New codes: {results.filter((r) => r.ok).map((r) => r.public_code).join(', ')}</Text>}
        </Panel>
      )}
    </>
  );
}
