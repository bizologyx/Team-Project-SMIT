import { auth, db } from './firebaseConfig.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * Get current active Firebase user (waits for initial auth state resolution)
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Get current active session (compatibility helper)
 */
export async function getSession() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { user };
}

/**
 * Fetch profile details for a given user ID from Firestore 'profiles' collection
 */
export async function getProfile(userId) {
  if (!userId) return null;
  try {
    const docRef = doc(db, 'profiles', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.warn('[Firebase] Profile doc not found for user ID:', userId);
      return null;
    }
  } catch (error) {
    console.error('[Firebase] Error fetching user profile:', error.message);
    return null;
  }
}

/**
 * Register a new user with Firebase Auth and create a profile in the Firestore 'profiles' collection.
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

  try {
    // 1. Create auth user in Firebase
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    // 2. Create user profile in Firestore 'profiles' collection
    const profileData = {
      id: user.uid,
      full_name: fullName.trim(),
      role: (role || 'client').toLowerCase(),
      language: (language || 'English').trim(),
      email: email.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'profiles', user.uid), profileData);
    } catch (dbError) {
      console.error('[Firebase Firestore Error]', dbError);
      if (dbError.code === 'permission-denied' || (dbError.message && dbError.message.includes('insufficient permissions'))) {
        throw new Error('Firestore Rules Error: Please enable Firestore Database and set Rules to allow read/write in Firebase Console.');
      }
      throw dbError;
    }

    // 3. Ensure user is signed out after signup so they must manually log in
    await signOut(auth);

    return user;
  } catch (error) {
    console.error('[Firebase SignUp Error]', error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email address is already registered.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password should be at least 8 characters long.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address format.');
    } else if (error.code === 'auth/operation-not-allowed') {
      throw new Error('Email/Password Sign-In is disabled. Please enable it in Firebase Console > Authentication > Sign-in method.');
    }
    throw new Error(error.message || 'Signup failed.');
  }
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

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return userCredential;
  } catch (error) {
    console.error('[Firebase Login Error]', error);
    if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      throw new Error('Invalid email or password.');
    } else if (error.code === 'auth/operation-not-allowed') {
      throw new Error('Email/Password Sign-In is disabled in Firebase Console.');
    }
    throw new Error(error.message || 'Login failed.');
  }
}

/**
 * Log out the current user and redirect to login page
 */
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out:', error.message);
  }
  window.location.href = '/login.html';
}

/**
 * Protect route: Redirect to login page if user is not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }

  const profile = await getProfile(user.uid);
  return { session: { user }, user, profile };
}

/**
 * Redirect logged in users away from auth pages (login/signup) to dashboard
 */
export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = '/dashboard';
  }
}
