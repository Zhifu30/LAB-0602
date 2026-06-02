/**
 * useProfiles — 用户列表的统一数据源
 * 替换 10+ 处重复的 supabase.from('profiles').select(...)
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  user_id: string;
  username: string;
  email?: string;
}

const profilesCache = new Map<string, UserProfile[]>();
let globalProfiles: UserProfile[] = [];
let loaded = false;

export function useProfiles() {
  const [profiles, setProfiles] = useState<UserProfile[]>(globalProfiles);
  const [loading, setLoading] = useState(!loaded);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, email')
        .order('username');
      if (!error && data) {
        globalProfiles = data;
        setProfiles(data);
        loaded = true;
      }
    } catch (e) {
      console.error('Error fetching profiles:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded) fetch();
  }, [fetch]);

  /** 根据 username 查邮箱 */
  const getEmailByUsername = useCallback((username: string): string | null => {
    return profiles.find(p => p.username === username)?.email || null;
  }, [profiles]);

  /** 根据 user_id 查用户 */
  const getUserById = useCallback((userId: string): UserProfile | null => {
    return profiles.find(p => p.user_id === userId) || null;
  }, [profiles]);

  /** 根据 username 查邮箱的同步版本（用于 map/遍历） */
  const getEmailMap = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    profiles.forEach(p => { if (p.username && p.email) map[p.username] = p.email; });
    return map;
  }, [profiles]);

  return { profiles, loading, refetch: fetch, getEmailByUsername, getUserById, getEmailMap };
}
