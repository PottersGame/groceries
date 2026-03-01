import { createContext, useContext, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SQLite from "expo-sqlite";
import { initLocalDatabase } from "../db/schema";

// ---------------------------------------------------------------------------
// Database context — provides the open SQLiteDatabase to the component tree
// ---------------------------------------------------------------------------

export const DbContext = createContext<SQLite.SQLiteDatabase | null>(null);

/** Returns the shared SQLite database instance (null until ready). */
export function useDb(): SQLite.SQLiteDatabase | null {
  return useContext(DbContext);
}

// ---------------------------------------------------------------------------
// Root layout — initialises the database and wraps the app in the provider
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;
    initLocalDatabase()
      .then((database) => {
        if (!cancelled) setDb(database);
      })
      .catch((e) => {
        console.error("Failed to initialise local database", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DbContext.Provider value={db}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </DbContext.Provider>
  );
}
