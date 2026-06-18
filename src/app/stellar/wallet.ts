import { useState, useEffect, useCallback } from "react";

const TIMEOUT_MS = 3000;

// Freighter API calls can hang if the extension is missing — race them with a timeout.
function withTimeout<T>(p: Promise<T>, fallback: T, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export interface WalletState {
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

export function useFreighter(): WalletState {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already connected on mount.
  useEffect(() => {
    (async () => {
      try {
        const freighter = await import("@stellar/freighter-api");
        const connected = await withTimeout(freighter.isConnected(), {
          isConnected: false,
        });
        if (!connected.isConnected) return;
        const { address } = await freighter.getAddress();
        if (address) setPublicKey(address);
      } catch {
        // Freighter not installed — silently ignore on mount.
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const freighter = await import("@stellar/freighter-api");

      const connected = await withTimeout(freighter.isConnected(), {
        isConnected: false,
      });
      if (!connected.isConnected) {
        throw new Error(
          "Freighter not detected. Install it from freighter.app and reload.",
        );
      }

      // requestAccess() prompts the user and returns their address (Freighter v6).
      const access = await freighter.requestAccess();
      if (access.error) throw new Error(access.error);
      if (!access.address) {
        throw new Error("No address returned — did you approve the request?");
      }

      setPublicKey(access.address);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setError(null);
  }, []);

  return { publicKey, connecting, error, connect, disconnect };
}
