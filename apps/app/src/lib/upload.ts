import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type Picked = { uri: string; type: string; ext: string };

export async function pickImage(opts?: { camera?: boolean }): Promise<Picked | null> {
  const res = opts?.camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const type = a.mimeType ?? 'image/jpeg';
  return { uri: a.uri, type, ext: (type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg') };
}

// Uploads to a PRIVATE bucket at "<profileId>/<random>.<ext>" (the folder is what
// storage security rules check). Returns the storage path.
export async function uploadImage(bucket: 'profile-photos' | 'verification-docs', profileId: string, img: Picked) {
  const bytes = await (await fetch(img.uri)).arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('image_too_large');
  const path = `${profileId}/${randomUUID()}.${img.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: img.type });
  if (error) throw error;
  return path;
}

export type PhotoUrl = { id: string; url: string; is_primary: boolean; status: string };

// Signed 60-second links from the photo-urls Edge Function (permission checked server-side).
export async function fetchPhotoUrls(owner: string, viewer?: string): Promise<PhotoUrl[]> {
  const { data, error } = await supabase.functions.invoke('photo-urls', { body: { owner, viewer: viewer ?? null } });
  if (error) throw error;
  return ((data as { photos?: PhotoUrl[] })?.photos ?? []);
}
