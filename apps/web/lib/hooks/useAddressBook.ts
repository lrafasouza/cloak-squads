"use client";

import { useWalletAuth } from "@/lib/use-wallet-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AddressBookEntry = {
  id: string;
  ownerPubkey: string;
  label: string;
  address: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateEntryInput = {
  label: string;
  address: string;
  notes?: string;
};

export type UpdateEntryInput = {
  id: string;
  label?: string;
  notes?: string | null;
};

const QUERY_KEY = ["address-book"] as const;

export function addressBookQueryKey(ownerPubkey: string | undefined) {
  return [...QUERY_KEY, ownerPubkey ?? "anon"] as const;
}

export function useAddressBook() {
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const ownerPubkey = wallet.publicKey?.toBase58();

  const query = useQuery({
    queryKey: addressBookQueryKey(ownerPubkey),
    enabled: !!ownerPubkey,
    staleTime: 60_000,
    queryFn: async (): Promise<AddressBookEntry[]> => {
      const res = await fetchWithAuth("/api/address-book");
      if (!res.ok) {
        if (res.status === 401) return [];
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load address book.");
      }
      const data = (await res.json()) as { entries: AddressBookEntry[] };
      return data.entries;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: addressBookQueryKey(ownerPubkey) });

  const createMutation = useMutation({
    mutationFn: async (input: CreateEntryInput): Promise<AddressBookEntry> => {
      const res = await fetchWithAuth("/api/address-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to save contact.");
      }
      const data = (await res.json()) as { entry: AddressBookEntry };
      return data.entry;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateEntryInput): Promise<AddressBookEntry> => {
      const res = await fetchWithAuth(`/api/address-book/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update contact.");
      }
      const data = (await res.json()) as { entry: AddressBookEntry };
      return data.entry;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetchWithAuth(`/api/address-book/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to delete contact.");
      }
    },
    onSuccess: invalidate,
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    creating: createMutation.isPending,
    updating: updateMutation.isPending,
    removing: deleteMutation.isPending,
  };
}

/** Find a saved entry by exact address match (case-sensitive base58). */
export function findEntryByAddress(
  entries: AddressBookEntry[],
  address: string,
): AddressBookEntry | undefined {
  return entries.find((e) => e.address === address);
}
