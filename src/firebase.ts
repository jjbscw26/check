import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const FIRESTORE_MIN_CREATED_AT = Timestamp.fromDate(
  new Date('2020-01-01T00:00:00.000Z')
);

const DEVICE_ID_STORAGE_KEY = 'bscw_auto_device_id';
const AUTO_WORKSPACE_EMAIL = 'sync@bscw.corp';

export function getAutoDeviceMetadata(): {
  createdByUid: string;
  createdByEmail: string;
} {
  let deviceId = 'dev_bscw_client';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_\-]{4,120}$/.test(existing)) {
        deviceId = existing;
      } else {
        const rand = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
          .replace(/[^a-zA-Z0-9_\-]/g, '');
        deviceId = `dev_${rand}`.slice(0, 64);
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }
    }
  } catch {
    deviceId = 'dev_bscw_client';
  }

  return {
    createdByUid: deviceId,
    createdByEmail: AUTO_WORKSPACE_EMAIL,
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
