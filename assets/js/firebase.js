import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// Paste the public Firebase Web app config from Firebase Console → Project settings.
export const firebaseConfig = {
  apiKey: 'AIzaSyC0k9xIs4plSmtYdflwD9bvxIwu1jvd6oE',
  authDomain: 'birdclocking-7d4a7.firebaseapp.com',
  projectId: 'birdclocking-7d4a7',
  storageBucket: 'birdclocking-7d4a7.firebasestorage.app',
  messagingSenderId: '29612367544',
  appId: '1:29612367544:web:ba0b2a0d163bad3dfcde4d',
  measurementId: 'G-8TWDLBVSBR'
};
export const firebaseConfigured = !Object.values(firebaseConfig).some(value => value.startsWith('YOUR_'));
export const firebaseAuth = firebaseConfigured ? getAuth(initializeApp(firebaseConfig)) : null;

export function waitForFirebaseUser() {
  if (!firebaseAuth) return Promise.resolve(null);
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, user => {
      unsubscribe();
      resolve(user);
    }, () => resolve(null));
  });
}
export const createFirebaseAccount = (email, password) => createUserWithEmailAndPassword(firebaseAuth, email, password);
export const signInFirebase = (email, password) => signInWithEmailAndPassword(firebaseAuth, email, password);
export const signOutFirebase = () => firebaseAuth ? signOut(firebaseAuth) : Promise.resolve();
