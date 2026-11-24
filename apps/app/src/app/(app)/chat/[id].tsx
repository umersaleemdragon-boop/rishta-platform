import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Icon, Sheet, Tag, type IconName } from '../../../components/kit';
import { Banner, Button, ChipSelect, Field, Row } from '../../../components/ui';
import { ENUM_LABELS, useI18n, type TKey } from '../../../lib/i18n';
import { friendlyError } from '../../../lib/profile';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Msg = { id: string; sender_profile_id: string | null; kind: 'text' | 'system'; body: string; created_at: string };
type Conv = { id: string; profile_a: string; profile_b: string; stage: string; closed_at: string | null; a_confirmed_at: string | null; b_confirmed_at: string | null };
type Access = { id: string; owner_profile_id: string; viewer_profile_id: string; status: string };
type Meeting = { id: string; proposed_by_profile_id: string; meeting_type: string; scheduled_for: string; location: string | null; video_link: string | null; status: string };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { profiles, guarded, entitlements } = useSession();
  const [conv, setConv] = useState<Conv | null>(null);
  const [other, setOther] = useState<{ id: string; name: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [photos, setPhotos] = useState<Access[]>([]);
  const [contacts, setContacts] = useState<Access[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [hasFamily, setHasFamily] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'meeting' | 'more' | 'contact' | null>(null);
  const [meetType, setMeetType] = useState<string | null>('in_person_family');
  const [meetWhen, setMeetWhen] = useState('');
  const [meetWhere, setMeetWhere] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [contact, setContact] = useState<Record<string, unknown> | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  // Which of "my" profiles is in this chat? Owner = can act; guardian = read-only.
  const me = useMemo(() => {
    if (!conv) return null;
    const ids = [conv.profile_a, conv.profile_b];
    const own = profiles.find((p) => ids.includes(p.id));
    if (own) return { id: own.id, readOnly: false };
    const g = guarded.find((x) => ids.includes(x.profile_id));
    return g ? { id: g.profile_id, readOnly: true } : null;
  }, [conv, profiles, guarded]);

  const loadSide = useCallback(async () => {
    const [p, c, m] = await Promise.all([
      supabase.from('photo_access').select('id,owner_profile_id,viewer_profile_id,status').eq('conversation_id', id),
      supabase.from('contact_shares').select('id,owner_profile_id,viewer_profile_id,status').eq('conversation_id', id),
      supabase.from('meetings').select('id,proposed_by_profile_id,meeting_type,scheduled_for,location,video_link,status')
        .eq('conversation_id', id).order('scheduled_for'),
    ]);
    setPhotos((p.data ?? []) as Access[]); setContacts((c.data ?? []) as Access[]); setMeetings((m.data ?? []) as Meeting[]);
  }, [id]);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from('conversations')
      .select('id,profile_a,profile_b,stage,closed_at,a_confirmed_at,b_confirmed_at').eq('id', id).maybeSingle();
    setConv(c as Conv | null);
    const { data: m } = await supabase.from('messages').select('id,sender_profile_id,kind,body,created_at')
      .eq('conversation_id', id).order('created_at').limit(500);
    setMsgs((m ?? []) as Msg[]);
    loadSide();
  }, [id, loadSide]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!me || !conv) return;
    const otherId = conv.profile_a === me.id ? conv.profile_b : conv.profile_a;
    supabase.rpc('list_conversations', { p_profile: me.id }).then(({ data }) => {
      const row = (data as { conversation_id: string; other_first_name: string; other_age: number }[] | null)?.find((r) => r.conversation_id === id);
      setOther({ id: otherId, name: row ? `${row.other_first_name}, ${row.other_age}` : '' });
    });
    supabase.from('profile_guardians').select('user_id', { count: 'exact', head: true }).eq('profile_id', me.id)
      .then(({ count }) => setHasFamily((count ?? 0) > 0 || me.readOnly));
    if (!me.readOnly) supabase.rpc('mark_conversation_read', { p_conversation: id, p_profile: me.id });
  }, [me, conv, id]);

  // Live updates: new messages + changes to requests / meetings.
  useEffect(() => {
    const ch = supabase.channel(`chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMsgs((prev) => (prev.some((x) => x.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg]));
          loadSide();
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, loadSide]);

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50); }, [msgs.length]);

  async function call(fn: string, args: Record<string, unknown>, okText?: string) {
    setError(null); setInfo(null);
    const { data, error: err } = await supabase.rpc(fn, args);
    if (err) {
      if (err.message === 'upgrade_required') { setError(friendlyError(err, lang)); return null; }
      setError(friendlyError(err, lang)); return null;
    }
    if (okText) setInfo(okText);
    loadSide();
    return data ?? true;
  }

  async function send() {
    if (!me || !text.trim()) return;
    const body = text.trim();
    setText('');
    const ok = await call('send_message', { p_conversation: id, p_from: me.id, p_body: body });
    if (!ok) setText(body);
  }

  async function proposeMeeting() {
    if (!me || !meetType) return;
    const when = new Date(meetWhen.trim().replace(' ', 'T'));
    if (Number.isNaN(when.getTime())) { setError(t('meetingWhen')); return; }
    const isVideo = meetType === 'video_call';
    const ok = await call('propose_meeting', { p_conversation: id, p_from: me.id, p_type: meetType, p_when: when.toISOString(),
      p_location: isVideo ? null : meetWhere || null, p_video_link: isVideo ? meetWhere || null : null, p_notes: null });
    if (ok) { setSheet(null); setMeetWhen(''); setMeetWhere(''); }
  }

  async function showContact() {
    if (!me || !other) return;
    const data = await call('get_contact_details', { p_viewer: me.id, p_owner: other.id });
    if (data) { setContact(data as Record<string, unknown>); setSheet('contact'); }
  }

  if (!conv || !me) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const closed = !!conv.closed_at;
  const canAct = !me.readOnly && !closed;
  const myPhotoReqIn = photos.find((p) => p.owner_profile_id === me.id && p.status === 'pending');
  const myPhotosShared = photos.find((p) => p.owner_profile_id === me.id && p.status === 'approved');
  const theirPhotosToMe = photos.find((p) => p.viewer_profile_id === me.id && p.status === 'approved');
  const iRequestedPhotos = photos.find((p) => p.viewer_profile_id === me.id && p.status === 'pending');
  const contactReqIn = contacts.find((c) => c.owner_profile_id === me.id && c.status === 'pending');
  const contactToMe = contacts.find((c) => c.viewer_profile_id === me.id && c.status === 'approved');
  const iConfirmed = conv.profile_a === me.id ? !!conv.a_confirmed_at : !!conv.b_confirmed_at;

  const sysText = (m: Msg) => { const k = `sys_${m.body}`; const s = t(k as TKey); return s === k ? m.body : s; };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))} accessibilityRole="button" accessibilityLabel={t('back')} style={styles.iconBtn}>
            <Icon name={lang === 'ur' ? 'chevron-forward' : 'chevron-back'} size={24} />
          </Pressable>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flex: 1 }} onPress={() => other && router.push(`/member/${other.id}`)}>
            <Avatar name={other?.name || '?'} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.headName} numberOfLines={1}>{other?.name}</Text>
              {hasFamily && <Text style={styles.wali}><Icon name="people" size={12} color={colors.success} /> {me.readOnly ? t('readOnly') : t('waliPresent')}</Text>}
            </View>
          </Pressable>
          {!me.readOnly && <Pressable onPress={() => setSheet('more')} accessibilityRole="button" accessibilityLabel={t('moreActions')} style={styles.iconBtn}>
            <Icon name="ellipsis-vertical" size={22} />
          </Pressable>}
        </View>

        <ScrollView ref={scroll} contentContainerStyle={styles.msgs}>
          {msgs.map((m) => m.kind === 'system' ? (
            <Text key={m.id} style={styles.sys}>{sysText(m)}</Text>
          ) : (
            <View key={m.id} style={[styles.bubble, m.sender_profile_id === me.id ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, m.sender_profile_id === me.id && { color: '#fff' }]}>{m.body}</Text>
            </View>
          ))}

          {myPhotoReqIn && canAct && (
            <ActionCard icon="images-outline" title={`${other?.name.split(',')[0]} ${t('photoRequestIn')}`}>
              <Row>
                <View style={{ flex: 1 }}><Button title={t('decline')} variant="secondary" onPress={() => call('respond_photo_request', { p_request: myPhotoReqIn.id, p_approve: false })} /></View>
                <View style={{ flex: 1 }}><Button title={t('sharePhotos')} onPress={() => call('respond_photo_request', { p_request: myPhotoReqIn.id, p_approve: true })} /></View>
              </Row>
            </ActionCard>
          )}
          {contactReqIn && canAct && (
            <ActionCard icon="call-outline" title={`${other?.name.split(',')[0]} ${t('contactRequestIn')}`}>
              <Row>
                <View style={{ flex: 1 }}><Button title={t('decline')} variant="secondary" onPress={() => call('respond_contact_request', { p_request: contactReqIn.id, p_approve: false })} /></View>
                <View style={{ flex: 1 }}><Button title={t('approve')} onPress={() => call('respond_contact_request', { p_request: contactReqIn.id, p_approve: true })} /></View>
              </Row>
            </ActionCard>
          )}
          {meetings.filter((mt) => mt.status === 'requested' || mt.status === 'scheduled').map((mt) => (
            <ActionCard key={mt.id} icon="calendar-outline" title={`${t('meetingTitle')} · ${t(`meetingType_${mt.meeting_type}` as TKey)}`}>
              <Text style={styles.cardText}>{new Date(mt.scheduled_for).toLocaleString()}{mt.location ? ` · ${mt.location}` : ''}{mt.video_link ? ` · ${mt.video_link}` : ''}</Text>
              <Tag label={t(`meetingStatus_${mt.status}` as TKey)} tone={mt.status === 'scheduled' ? 'green' : 'gold'} />
              {canAct && mt.status === 'requested' && mt.proposed_by_profile_id !== me.id && (
                <Row>
                  <View style={{ flex: 1 }}><Button title={t('decline')} variant="secondary" onPress={() => call('respond_meeting', { p_meeting: mt.id, p_by: me.id, p_accept: false })} /></View>
                  <View style={{ flex: 1 }}><Button title={t('confirm')} onPress={() => call('respond_meeting', { p_meeting: mt.id, p_by: me.id, p_accept: true })} /></View>
                </Row>
              )}
              {canAct && (
                <Row>
                  {mt.status === 'scheduled' && <Button title={t('markDone')} variant="ghost" onPress={() => call('complete_meeting', { p_meeting: mt.id, p_by: me.id, p_note: null })} />}
                  <Button title={t('cancel2')} variant="ghost" onPress={() => call('cancel_meeting', { p_meeting: mt.id, p_by: me.id })} />
                </Row>
              )}
            </ActionCard>
          ))}
          {theirPhotosToMe && (
            <ActionCard icon="image-outline" title={t('photos')}>
              <Text style={styles.cardText}>{t('sys_photo_request_approved')} — {lang === 'ur' ? 'تصاویر دیکھنے کی سہولت اگلی اپڈیٹ میں۔' : 'the protected photo viewer arrives in the next update.'}</Text>
            </ActionCard>
          )}
          {contactToMe && <Button title={t('viewContact')} variant="secondary" onPress={showContact} />}
          {closed && <Banner>{t('sys_conversation_closed')}</Banner>}
          <Text style={styles.safety}>{t('safetyNote')}</Text>
        </ScrollView>

        {error && <View style={{ paddingHorizontal: space(3) }}><Banner kind="error">{error}</Banner></View>}
        {info && <View style={{ paddingHorizontal: space(3) }}><Banner kind="success">{info}</Banner></View>}

        {canAct && (
          <View style={styles.footer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
              {!iRequestedPhotos && !theirPhotosToMe && <Chip icon="images-outline" label={t('requestPhotos')} onPress={() => call('request_photo_access', { p_conversation: id, p_from: me.id }, t('sys_photo_requested'))} />}
              {!myPhotosShared
                ? <Chip icon="eye-outline" label={t('sharePhotos')} onPress={() => call('share_photos', { p_conversation: id, p_owner: me.id })} />
                : <Chip icon="eye-off-outline" label={t('revokePhotos')} onPress={() => other && call('revoke_photo_access', { p_owner: me.id, p_viewer: other.id })} />}
              <Chip icon="calendar-outline" label={t('propose')} onPress={() => setSheet('meeting')} />
              {!contactToMe && <Chip icon="call-outline" label={`${t('shareContact')}${entitlements?.tier === 'premium' ? '' : ' · Premium'}`} gold
                onPress={() => call('request_contact', { p_conversation: id, p_from: me.id }, t('sys_contact_requested'))} />}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput value={text} onChangeText={setText} placeholder={t('typeMessage')} placeholderTextColor="#9AA0A6"
                style={[styles.input, lang === 'ur' && { textAlign: 'right' }]} multiline maxLength={2000} accessibilityLabel={t('typeMessage')} onSubmitEditing={send} />
              <Pressable onPress={send} accessibilityRole="button" accessibilityLabel={t('send')} style={styles.sendBtn}>
                <Icon name="send" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <Sheet open={sheet === 'meeting'} onClose={() => setSheet(null)} title={t('propose')}>
        <ChipSelect label={t('meetingTitle')} value={meetType} onChange={setMeetType} required
          options={[{ value: 'in_person_family', label: t('meetingType_in_person_family') }, { value: 'video_call', label: t('meetingType_video_call') }]} />
        <Field label={t('meetingWhen')} required value={meetWhen} onChangeText={setMeetWhen} placeholder="2026-12-05 17:00" />
        <Field label={t('meetingWhere')} value={meetWhere} onChangeText={setMeetWhere} maxLength={300} />
        {error && <Banner kind="error">{error}</Banner>}
        <Button title={t('propose')} onPress={proposeMeeting} />
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={t('moreActions')}>
        {!closed && !iConfirmed && conv.stage !== 'rishta_confirmed' && (
          <Button title={`💍 ${t('confirmRishta')}`} onPress={async () => { if (await call('confirm_rishta', { p_conversation: id, p_by: me.id })) { setSheet(null); load(); } }} />
        )}
        <ChipSelect label={t('reportReason')} value={reason} onChange={setReason}
          options={Object.entries(ENUM_LABELS.report_reason).map(([value, l]) => ({ value, label: l[lang] }))} />
        <Button title={t('report')} variant="secondary" disabled={!reason}
          onPress={async () => { if (other && await call('report_profile', { p_from: me.id, p_target: other.id, p_reason: reason, p_details: null, p_conversation: id }, t('reportSent'))) setSheet(null); }} />
        {!closed && <Button title={t('endChat')} variant="secondary" onPress={async () => { if (await call('close_conversation', { p_conversation: id, p_by: me.id })) { setSheet(null); load(); } }} />}
        <Button title={t('block')} variant="danger" onPress={async () => { if (other && await call('block_profile', { p_from: me.id, p_target: other.id })) router.replace('/chats'); }} />
      </Sheet>

      <Sheet open={sheet === 'contact'} onClose={() => setSheet(null)} title={t('viewContact')}>
        {contact?.via_bureau ? (
          <>
            <Text style={styles.cardText}>{t('contactVia')}</Text>
            <Text style={styles.contactBig}>{String((contact.bureau as Record<string, string>)?.phone || (contact.bureau as Record<string, string>)?.whatsapp || '')}</Text>
          </>
        ) : contact ? (
          <>
            <Text style={styles.cardText}>{[contact.first_name, contact.last_name].filter(Boolean).join(' ')}</Text>
            <Text style={styles.contactBig}>{String(contact.phone ?? '')}</Text>
            {contact.whatsapp && contact.whatsapp !== contact.phone ? <Text style={styles.cardText}>WhatsApp: {String(contact.whatsapp)}</Text> : null}
          </>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

function ActionCard({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
        <View style={styles.cardIcon}><Icon name={icon} size={18} color="#7A5C0E" /></View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Chip({ icon, label, onPress, gold }: { icon: IconName; label: string; onPress: () => void; gold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, gold && styles.chipGold]}>
      <Icon name={icon} size={15} color={gold ? '#7A5C0E' : colors.primary} />
      <Text style={[styles.chipText, gold && { color: '#7A5C0E' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingHorizontal: space(2), paddingVertical: space(2), backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headName: { fontSize: 16, fontWeight: '700', color: colors.text },
  wali: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 1 },
  msgs: { padding: space(4), gap: space(2.5) },
  sys: { alignSelf: 'center', fontSize: 12.5, color: colors.muted, backgroundColor: '#ECE8DF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, textAlign: 'center' },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EBD9A6', borderRadius: radius.lg, padding: space(3.5), gap: space(2.5) },
  cardIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FBF3DC', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
  cardText: { fontSize: 14, color: '#3C4148', lineHeight: 20 },
  contactBig: { fontSize: 26, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  safety: { alignSelf: 'center', fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 300, marginTop: space(2) },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, padding: space(3), gap: space(2.5) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipGold: { backgroundColor: '#FBF3DC', borderColor: '#EBD9A6' },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.primary },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2) },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.text },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
