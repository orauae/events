import { z } from 'zod';
import { db } from '@/db';
import { addresses, type Address } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const createAddressSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  formattedAddress: z.string().trim().min(1, 'Address is required').max(500),
  latitude: z.string().min(1),
  longitude: z.string().min(1),
  placeId: z.string().optional(),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const AddressService = {
  async create(input: CreateAddressInput): Promise<Address> {
    const validated = createAddressSchema.parse(input);
    const [address] = await db.insert(addresses).values(validated).returning();
    return address;
  },

  async getAll(): Promise<Address[]> {
    return db.query.addresses.findMany({ orderBy: desc(addresses.createdAt) });
  },

  async getById(id: string): Promise<Address | null> {
    const address = await db.query.addresses.findFirst({ where: eq(addresses.id, id) });
    return address ?? null;
  },

  async delete(id: string): Promise<void> {
    await db.delete(addresses).where(eq(addresses.id, id));
  },
};
