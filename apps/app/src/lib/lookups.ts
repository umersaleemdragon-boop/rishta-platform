import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Lookup = { category: string; value: string; label_en: string; label_ur: string | null; sort_order: number };
let cache: Lookup[] | null = null;
let pending: Promise<Lookup[]> | null = null;

async function load(): Promise<Lookup[]> {
  if (cache) return cache;
  pending ??= (async () => {
    const { data, error } = await supabase.from('lookups').select('category,value,label_en,label_ur,sort_order')
      .eq('is_active', true).order('sort_order');
    if (error) { pending = null; throw error; }
    cache = data ?? [];
    return cache;
  })();
  return pending;
}

export function useLookups() {
  const [items, setItems] = useState<Lookup[]>(cache ?? []);
  useEffect(() => { load().then(setItems).catch(() => {}); }, []);
  return {
    options: (category: string, lang: 'en' | 'ur') =>
      items.filter((i) => i.category === category)
        .map((i) => ({ value: i.value, label: (lang === 'ur' ? i.label_ur : null) ?? i.label_en })),
  };
}
