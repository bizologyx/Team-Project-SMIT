import { supabase } from './supabaseClient.js';

/**
 * Get current active session
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error.message);
    return null;
  }
  return session;
}

/**
 * Fetch profile details for a given user ID
 */
export async function getProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error.message);
    return null;
  }
  return data;
}

/**
 * Register a new user with Supabase Auth and create a profile in the 'profiles' table.
 * Signs out immediately after registration so the user must log in manually.
 */
export async function signUpUser({ fullName, email, password, confirmPassword, role = 'client', language = 'English' }) {
  // Field Validation
  if (!fullName || !email || !password || !confirmPassword) {
    throw new Error('All fields are required.');
  }

  if (password !== confirmPassword) {
    throw new Error('Password and Confirm Password do not match.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 1. Create auth user in Supabase
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.trim(),
    password: password
  });

  if (authError) {
    if (authError.message.toLowerCase().includes('rate limit')) {
      throw new Error('Supabase email rate limit exceeded. Please disable "Confirm email" in your Supabase Auth settings or try again in a few minutes.');
    }
    throw new Error(authError.message);
  }

  const user = authData?.user;
  if (!user) {
    throw new Error('User creation failed.');
  }

  // 2. Create user profile in 'profiles' table
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([
      {
        id: user.id,
        full_name: fullName.trim(),
        role: (role || 'client').toLowerCase(),
        language: (language || 'English').trim()
      }
    ]);

  if (profileError) {
    console.warn('Profile insertion warning:', profileError.message);
  }

  // 3. Ensure user is signed out after signup so they must manually log in
  await supabase.auth.signOut();

  return user;
}

/**
 * Log in an existing user with Email and Password
 */
export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new Error('Please enter both Email and Password.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Invalid email or password.');
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Log out the current user and redirect to login page
 */
export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error logging out:', error.message);
  }
  window.location.href = '/login.html';
}

/**
 * Protect route: Redirect to login page if user is not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  const profile = await getProfile(session.user.id);
  return { session, user: session.user, profile };
}

/**
 * Redirect logged in users away from auth pages (login/signup) to dashboard
 */
export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session) {
    window.location.href = '/dashboard';
  }
}
