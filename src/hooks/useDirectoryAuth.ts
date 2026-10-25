import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  isAuthorizedDirectoryUser,
  signInToDirectoryWithGoogle,
  signOutFromDirectory,
} from '../firebase';

function formatAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Se cerró la ventana de inicio de sesión antes de completar la autenticación.';
  }
  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes para este sitio e intenta nuevamente.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Error de conexión de red al verificar tus credenciales. Revisa tu conexión a internet.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este dominio aún no está autorizado en Firebase Authentication.';
  }
  return 'No fue posible iniciar sesión con Google. Intenta nuevamente.';
}

export interface DirectoryAuthState {
  user: User | null;
  authReady: boolean;
  isAuthenticated: boolean;
  isAdminUser: boolean;
  isSigningIn: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutDirectory: () => Promise<void>;
}

export function useDirectoryAuth(): DirectoryAuthState {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const signedInUser = await signInToDirectoryWithGoogle();
      if (!signedInUser.emailVerified) {
        setAuthError(
          'Tu cuenta de Google debe tener un correo electrónico verificado para acceder al Directorio.'
        );
      }
    } catch (err) {
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutDirectory = useCallback(async () => {
    setAuthError(null);
    await signOutFromDirectory();
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const isAuthenticated = isAuthorizedDirectoryUser(user);
  const isAdminUser = Boolean(
    isAuthenticated && user?.email?.trim() === BOOTSTRAPPED_ADMIN_EMAIL
  );

  return {
    user,
    authReady,
    isAuthenticated,
    isAdminUser,
    isSigningIn,
    authError,
    clearAuthError,
    signInWithGoogle,
    signOutDirectory,
  };
}
