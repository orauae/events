import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface Address {
  id: string
  name: string
  formattedAddress: string
  latitude: string
  longitude: string
  placeId?: string | null
  createdAt: string
}

export function useAddresses() {
  return useQuery<{ data: Address[] }>({
    queryKey: ["addresses"],
    queryFn: async () => {
      const res = await fetch("/api/addresses")
      if (!res.ok) throw new Error("Failed to fetch addresses")
      return res.json()
    },
  })
}

export function useCreateAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Address, "id" | "createdAt">) => {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Failed to create address")
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  })
}

export function useDeleteAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete address")
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  })
}
