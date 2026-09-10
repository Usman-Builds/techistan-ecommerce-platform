/**
 * Saved-address API bindings (script 10, FR-402). JWT-guarded on the backend, so
 * these only return data for a signed-in customer.
 */
import { apiClient } from "./client";
import type { OrderAddress } from "./orders";

export interface SavedAddress extends OrderAddress {
  id: string;
  label: string | null;
  isDefault: boolean;
}

export interface CreateAddressInput extends OrderAddress {
  label?: string;
  isDefault?: boolean;
}

export const listAddresses = () => apiClient.get<SavedAddress[]>("/addresses");

export const createAddress = (input: CreateAddressInput) =>
  apiClient.post<SavedAddress>("/addresses", input);

export const deleteAddress = (id: string) =>
  apiClient.delete<{ deleted: boolean }>(`/addresses/${id}`);
