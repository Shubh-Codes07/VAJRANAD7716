import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration with environment variable support
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyA7cyaABlP4tB3isv-7Hk5LBGc5vYlAN1o",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "vajranad-ff551.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "vajranad-ff551",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "vajranad-ff551.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "145583737989",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:145583737989:web:7336c1991c1ffcb0b5edec"
};

// Mask sensitive keys for logging
const maskedConfig = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 4)}...${firebaseConfig.apiKey.substring(firebaseConfig.apiKey.length - 4)}` : 'UNDEFINED',
  appId: firebaseConfig.appId ? `${firebaseConfig.appId.substring(0, 4)}...${firebaseConfig.appId.substring(firebaseConfig.appId.length - 4)}` : 'UNDEFINED'
};

console.log('[FIREBASE INIT] Initializing with config:', maskedConfig);

// Initialization of Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Custom Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function cleanObjectForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanObjectForFirestore(item)) as any;
  }
  const result: any = {};
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      result[key] = cleanObjectForFirestore(val);
    }
  }
  return result;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isPermissionError = errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('insufficient');

  if (isPermissionError) {
    console.warn(
      `⚠️ [Firebase Configuration Guide] Firestore Permission Denied (Operation: ${operationType}, Path: ${path})\n\n` +
      `Your Firebase project 'vajranad-ff551' has active security rules that restricted this request.\n` +
      `To allow public read/write access (or authenticated access) for your pathak members, please copy and paste the following rules in your Firebase Console -> Firestore Database -> Rules:\n\n` +
      `rules_version = '2';\n` +
      `service cloud.firestore {\n` +
      `  match /databases/{database}/documents {\n` +
      `    match /{document=**} {\n` +
      `      allow read, write: if true; // Or apply more secure rules from 'firestore.rules'\n` +
      `    }\n` +
      `  }\n` +
      `}\n\n` +
      `Currently running with offline-first LocalStorage fallback successfully!`
    );
  } else {
    const errInfo: FirestoreErrorInfo = {
      error: errMsg,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw error;
}
