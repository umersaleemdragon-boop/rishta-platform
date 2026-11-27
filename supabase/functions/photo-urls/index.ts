// photo-urls: returns short-lived (60 s) signed URLs for profile photos.
//
// POST { owner: uuid, viewer?: uuid }
//   viewer omitted -> the caller's own profile photos (incl. pending ones)
//   viewer given   -> owner's APPROVED photos, only if owner granted viewer access
//
// Permission is decided by the database function get_photo_paths(), executed
// AS THE CALLER (their JWT), so RLS + the photo_access grants apply. Only after
// that check passes does the service role sign the private storage paths.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Row = { photo_id: string; storage_path: string; is_primary: boolean; sort_order: number; status: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not_authorized' }, 401);

  let owner: unknown, viewer: unknown;
  try { ({ owner, viewer } = await req.json()); } catch { return json({ error: 'invalid_input' }, 400); }
  if (typeof owner !== 'string' || !UUID.test(owner) || (viewer != null && (typeof viewer !== 'string' || !UUID.test(viewer)))) {
    return json({ error: 'invalid_input' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asCaller.rpc('get_photo_paths', { p_owner: owner, p_viewer: viewer ?? null });
  if (error) return json({ error: error.message }, 403);

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return json({ photos: [] });

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signed, error: signErr } = await service.storage.from('profile-photos')
    .createSignedUrls(rows.map((r) => r.storage_path), 60);
  if (signErr) return json({ error: 'sign_failed' }, 500);

  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return json({
    expires_in: 60,
    photos: rows
      .filter((r) => byPath.get(r.storage_path))
      .map((r) => ({ id: r.photo_id, url: byPath.get(r.storage_path), is_primary: r.is_primary, status: r.status })),
  });
});
