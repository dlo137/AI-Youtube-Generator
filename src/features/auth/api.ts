import { supabase, redirectTo } from "../../../lib/supabase";

export async function signUpEmail(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: fullName
      }
    },
  });
  if (error) throw error;

  // Update profile table with the name if user was created
  if (data.user && fullName) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', data.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }
  }

  return data;
}

export async function signInEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Profile management functions
export async function getMyProfile() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await supabase.from("profiles")
    .select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(updates: {
  full_name?: string;
  avatar_url?: string;
  website?: string;
}) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function signInWithApple() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: redirectTo,
    },
  });
  if (error) throw error;
  return data;
}